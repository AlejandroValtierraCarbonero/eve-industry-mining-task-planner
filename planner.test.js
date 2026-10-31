const test = require("node:test");
const assert = require("node:assert/strict");
const planner = require("./planner.js");

test("agrega necesidades solo de proyectos activos", () => {
  const projects = [
    { active: true, requirements: { Tritanium: 100, Pyerite: 10 } },
    { active: true, requirements: { Tritanium: 50 } },
    { active: false, requirements: { Tritanium: 900 } }
  ];
  assert.deepEqual(planner.getRequirements(projects), { Tritanium: 150, Pyerite: 10 });
});

test("asigna minerales por prioridad y limita el avance a lo requerido", () => {
  const projects = [
    { id: "low", active: true, priority: 1, createdAt: 1, requirements: { Tritanium: 100 } },
    { id: "high", active: true, priority: 3, createdAt: 2, requirements: { Tritanium: 80 } }
  ];
  const allocations = planner.allocateMinerals(projects, { Tritanium: 120 });
  assert.deepEqual(allocations.high, { Tritanium: 80 });
  assert.deepEqual(allocations.low, { Tritanium: 40 });
  assert.equal(planner.getProgress(projects[1], allocations.high), 100);
  assert.equal(planner.getProgress(projects[0], allocations.low), 40);
});

test("calcula el progreso global ponderado por materiales y los excedentes", () => {
  const requirements = { Tritanium: 100, Pyerite: 300 };
  assert.equal(planner.getGroupProgress(requirements, { Tritanium: 100, Pyerite: 100 }), 50);
  assert.deepEqual(planner.getOverflow(requirements, { Tritanium: 120, Pyerite: 250 }), { Tritanium: 20 });
});

test("recomienda perfiles por volumen según eficiencia y déficit crítico", () => {
  const recommendations = planner.recommendOres(
    { Tritanium: 100, Pyerite: 200 },
    { Pyerite: 180 },
    [
      { name: "A", volume: 10, yields: { Tritanium: 50 } },
      { name: "B", volume: 5, yields: { Tritanium: 50 } }
    ],
    100
  );
  assert.equal(recommendations[0].name, "B");
  assert.equal(recommendations[0].batches, 2);
  assert.equal(recommendations[0].volume, 10);
});
