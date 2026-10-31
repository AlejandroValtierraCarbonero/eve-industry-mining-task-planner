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

test("busca blueprints sin distinguir mayúsculas ni acentos y limita resultados", () => {
  const catalog = [
    { name: "La Drake", englishName: "Drake" },
    { name: "La Dracón", englishName: "Dracon" },
    { name: "Rifter", englishName: "Rifter" }
  ];
  assert.deepEqual(planner.searchBlueprints(catalog, "drake"), [catalog[0]]);
  assert.deepEqual(planner.searchBlueprints(catalog, "dracon"), [catalog[1]]);
  assert.equal(planner.searchBlueprints(catalog, "d", 1).length, 1);
  assert.deepEqual(planner.searchBlueprints(catalog, ""), []);
});

test("calcula los materiales por número de lotes y redondea hacia arriba", () => {
  const plan = planner.getBlueprintPlan({
    outputQuantity: 3,
    materials: [
      { typeId: 34, name: "Tritanio", quantity: 100 },
      { typeId: 35, name: "Pierita", quantity: 25 }
    ]
  }, 4);
  assert.equal(plan.runs, 2);
  assert.equal(plan.producedQuantity, 6);
  assert.deepEqual(plan.materials.map((item) => item.requiredQuantity), [200, 50]);
  assert.throws(() => planner.getBlueprintPlan({ outputQuantity: 0, materials: [] }, 1), RangeError);
});

test("aplica ME al total del trabajo y redondea hacia arriba por material", () => {
  const plan = planner.getBlueprintPlan({
    outputQuantity: 1,
    materials: [{ name: "Tritanio", quantity: 4 }]
  }, 3, 10);
  assert.equal(plan.runs, 3);
  assert.equal(plan.materialEfficiency, 10);
  assert.equal(plan.materials[0].baseRequiredQuantity, 12);
  assert.equal(plan.materials[0].requiredQuantity, 11);
  assert.throws(() => planner.getBlueprintPlan({
    outputQuantity: 1,
    materials: [{ name: "Tritanio", quantity: 4 }]
  }, 1, 10.1), RangeError);
});
