(() => {
  const ATLAS_SIZE = 2048;
  const INSTANCE_SIZE = 15;
  const { renderData } = LanebreakMatch;
  const vertexSource = `#version 300 es
    layout(location = 0) in vec4 bounds;
    layout(location = 1) in vec4 textureBounds;
    layout(location = 2) in vec4 tint;
    layout(location = 3) in vec3 pose;
    uniform vec4 camera;
    out vec2 uv;
    out vec4 color;
    void main() {
      vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
      vec2 offset = (corner - 0.5) * bounds.zw;
      vec2 world = bounds.xy + vec2(pose.x * offset.x - pose.y * offset.y,
                                   pose.y * offset.x + pose.x * offset.y);
      vec2 screen = (world - camera.xy) * camera.zw;
      gl_Position = vec4(screen.x - 1.0, 1.0 - screen.y, 0.0, 1.0);
      uv = mix(textureBounds.xy, textureBounds.zw, vec2(pose.z < 0.0 ? 1.0 - corner.x : corner.x, corner.y));
      color = tint;
    }`;
  const fragmentSource = `#version 300 es
    precision highp float;
    uniform sampler2D atlas;
    in vec2 uv;
    in vec4 color;
    out vec4 pixel;
    void main() {
      pixel = texture(atlas, uv) * color;
    }`;

  function shader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }

  class SpriteBatch {
    constructor(canvas) {
      this.canvas = canvas;
      this.gl = canvas.getContext('webgl2', {
        alpha:true, antialias:false, depth:false, stencil:false, powerPreference:'high-performance'
      });
      this.capacity = 512;
      this.colors = new Map();
      this.ready = false;
      this.pendingProgram = null;
      this.setupFence = null;
      if (!this.gl) return;
      canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        this.ready = false;
        this.pendingProgram = null;
        this.setupFence = null;
      });
      canvas.addEventListener('webglcontextrestored', () => this.initialize());
      this.initialize();
    }
    initialize() {
      const gl = this.gl;
      let vertex, fragment, program;
      try {
        this.parallelCompile = gl.getExtension('KHR_parallel_shader_compile');
        vertex = shader(gl, gl.VERTEX_SHADER, vertexSource);
        fragment = shader(gl, gl.FRAGMENT_SHADER, fragmentSource);
        program = gl.createProgram();
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        this.pendingProgram = program;
      } catch {
        if (program) gl.deleteProgram(program);
      } finally {
        if (vertex) gl.deleteShader(vertex);
        if (fragment) gl.deleteShader(fragment);
      }
    }
    finishInitialization() {
      const program = this.pendingProgram;
      if (!program) return;
      const gl = this.gl;
      // Keep drawing with Canvas until the driver can report link status without waiting for compilation.
      if (this.parallelCompile &&
          !gl.getProgramParameter(program, this.parallelCompile.COMPLETION_STATUS_KHR)) return;
      this.pendingProgram = null;
      let fence;
      try {
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
        gl.useProgram(program);
        this.camera = gl.getUniformLocation(program, 'camera');
        this.buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.capacity * INSTANCE_SIZE * 4, gl.DYNAMIC_DRAW);
        const stride = INSTANCE_SIZE * 4;
        for (let i = 0; i < 4; i++) {
          gl.enableVertexAttribArray(i);
          gl.vertexAttribPointer(i, i === 3 ? 3 : 4, gl.FLOAT, false, stride, i * 16);
          gl.vertexAttribDivisor(i, 1);
        }
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, ATLAS_SIZE, ATLAS_SIZE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.clearColor(0, 0, 0, 0);
        this.resetAtlas();
        fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (!fence) return;
        gl.flush();
        this.setupFence = fence;
      } catch {
        this.ready = false;
      } finally {
        if (!this.setupFence) {
          if (fence) gl.deleteSync(fence);
          gl.deleteProgram(program);
        }
      }
    }
    resetAtlas() {
      const gl = this.gl;
      this.regions = new WeakMap();
      this.atlasX = 4;
      this.atlasY = 1;
      this.rowHeight = 0;
      this.atlasFull = false;
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255,255,255,255]));
    }
    begin(width, height, x, y, scale) {
      if (this.pendingProgram) {
        this.finishInitialization();
        return false;
      }
      const gl = this.gl;
      if (this.setupFence) {
        // Validate allocations after the GPU has finished consuming the setup commands.
        const status = gl.clientWaitSync(this.setupFence, 0, 0);
        if (status === gl.TIMEOUT_EXPIRED) return false;
        gl.deleteSync(this.setupFence);
        this.setupFence = null;
        this.ready = status !== gl.WAIT_FAILED && gl.getError() === gl.NO_ERROR;
      }
      if (!this.ready) return false;
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
      // Atlas slots can be reused only after the preceding batch has been submitted.
      if (this.atlasFull) this.resetAtlas();
      this.length = 0;
      this.instances = renderData.spriteBuffer(this.capacity);
      gl.uniform4f(this.camera, x, y, 2 * scale / width, 2 * scale / height);
      return true;
    }
    region(image) {
      const cached = this.regions.get(image);
      if (cached) return cached;
      const {width, height} = image;
      if (width + 2 > ATLAS_SIZE || height + 2 > ATLAS_SIZE) return null;
      if (this.atlasX + width + 1 > ATLAS_SIZE) {
        this.atlasX = 1;
        this.atlasY += this.rowHeight + 2;
        this.rowHeight = 0;
      }
      if (this.atlasY + height + 1 > ATLAS_SIZE) {
        this.atlasFull = true;
        return null;
      }
      const x = this.atlasX, y = this.atlasY;
      const gl = this.gl;
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, image);
      const uv = [x+.5, y+.5, x+width-.5, y+height-.5];
      this.atlasX += width + 2;
      this.rowHeight = Math.max(this.rowHeight, height);
      this.regions.set(image, uv);
      return uv;
    }
    image(image, x, y, width, height, angle = 0, flip = 1, alpha = 1) {
      const uv = this.region(image);
      if (!uv) return false;
      this.quad(x, y, width, height, uv, 1, 1, 1, alpha, angle, 0, flip);
      return true;
    }
    rect(x, y, width, height, color) {
      if (width <= 0 || height <= 0) return;
      let rgba = this.colors.get(color);
      if (!rgba) {
        const hex = color.slice(1);
        const value = Number.parseInt(hex.length === 4 ? [...hex].map(d => d+d).join('') : hex, 16);
        const alpha = hex.length === 8 || hex.length === 4 ? (value & 255) / 255 : 1;
        const rgb = hex.length === 8 || hex.length === 4 ? value >>> 8 : value;
        rgba = [((rgb >>> 16) & 255)/255, ((rgb >>> 8) & 255)/255, (rgb & 255)/255, alpha];
        this.colors.set(color, rgba);
      }
      this.quad(x, y, width, height, WHITE, rgba[0], rgba[1], rgba[2], rgba[3], 0, 1, 1);
    }
    quad(x, y, width, height, uv, red, green, blue, alpha, angle, corner, flip) {
      let at = this.length;
      const end = at + INSTANCE_SIZE;
      if (end > this.instances.length) {
        this.capacity *= 2;
        this.instances = renderData.spriteBuffer(this.capacity);
        const gl = this.gl;
        gl.bufferData(gl.ARRAY_BUFFER, this.capacity * INSTANCE_SIZE * 4, gl.DYNAMIC_DRAW);
      }
      const data = this.instances;
      data[at++] = x; data[at++] = y; data[at++] = width; data[at++] = height;
      data[at++] = uv[0]; data[at++] = uv[1]; data[at++] = uv[2]; data[at++] = uv[3];
      data[at++] = red; data[at++] = green; data[at++] = blue; data[at++] = alpha;
      data[at++] = angle; data[at++] = corner; data[at] = flip;
      this.length = end;
    }
    draw() {
      const gl = this.gl;
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!this.length) return;
      renderData.prepareSprites(this.length / INSTANCE_SIZE);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instances, 0, this.length);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.length / INSTANCE_SIZE);
    }
  }
  const WHITE = [0.5, 0.5, 0.5, 0.5];
  globalThis.LanebreakSpriteBatch = SpriteBatch;
})();
