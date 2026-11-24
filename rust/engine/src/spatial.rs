use super::{Id, Point};

const CELL_SIZE: f64 = 256.0;

pub(super) struct UnitGrid {
    columns: usize,
    rows: usize,
    cells: Vec<Vec<Id>>,
    pub(super) max_radius: f64,
}

impl UnitGrid {
    pub(super) fn new(width: f64, height: f64) -> Self {
        let columns = 1 + (width / CELL_SIZE) as usize;
        let rows = 1 + (height / CELL_SIZE) as usize;
        Self {
            columns,
            rows,
            cells: vec![Vec::new(); columns * rows],
            max_radius: 0.0,
        }
    }

    fn coordinates(&self, point: Point) -> (usize, usize) {
        (
            ((point.x / CELL_SIZE) as usize).min(self.columns - 1),
            ((point.y / CELL_SIZE) as usize).min(self.rows - 1),
        )
    }

    fn cell(&self, point: Point) -> usize {
        let (x, y) = self.coordinates(point);
        y * self.columns + x
    }

    pub(super) fn insert(&mut self, id: Id, position: Point, radius: f64) {
        self.max_radius = self.max_radius.max(radius);
        let cell = self.cell(position);
        self.cells[cell].push(id);
    }

    fn remove_from(&mut self, id: Id, cell: usize) {
        let bucket = &mut self.cells[cell];
        let index = bucket
            .iter()
            .position(|&entry| entry == id)
            .expect("indexed unit");
        bucket.swap_remove(index);
    }

    pub(super) fn remove(&mut self, id: Id, position: Point) {
        self.remove_from(id, self.cell(position));
    }

    pub(super) fn move_unit(&mut self, id: Id, from: Point, to: Point) {
        let from = self.cell(from);
        let to = self.cell(to);
        if from != to {
            self.remove_from(id, from);
            self.cells[to].push(id);
        }
    }

    pub(super) fn within_bounds(
        &self,
        start: Point,
        end: Point,
        pad: f64,
    ) -> impl Iterator<Item = Id> + '_ {
        let (min_x, min_y) = self.coordinates(Point::new(
            start.x.min(end.x) - pad,
            start.y.min(end.y) - pad,
        ));
        let (max_x, max_y) = self.coordinates(Point::new(
            start.x.max(end.x) + pad,
            start.y.max(end.y) + pad,
        ));
        (min_y..=max_y).flat_map(move |y| {
            let row = y * self.columns;
            self.cells[row + min_x..=row + max_x]
                .iter()
                .flatten()
                .copied()
        })
    }
}
