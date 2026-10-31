(function (root, factory) {
  const planner = factory();
  if (typeof module === "object" && module.exports) module.exports = planner;
  root.EvePlanner = planner;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const MINERALS = [
    "Tritanium", "Pyerite", "Mexallon", "Isogen",
    "Nocxium", "Zydrine", "Megacyte", "Morphite"
  ];

  function normalizeSearchText(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  }

  function searchBlueprints(catalog, query, limit) {
    const search = normalizeSearchText(query).trim();
    if (!search || !Array.isArray(catalog)) return [];
    const maxResults = Number.isInteger(limit) && limit > 0 ? limit : 12;
    return catalog.map((blueprint) => {
      const names = [blueprint.name, blueprint.englishName, blueprint.blueprintName]
        .map(normalizeSearchText);
      const match = names.find((name) => name.includes(search));
      if (match === undefined) return null;
      return { blueprint, rank: match.startsWith(search) ? 0 : 1 };
    }).filter(Boolean)
      .sort((a, b) => a.rank - b.rank || a.blueprint.name.localeCompare(b.blueprint.name))
      .slice(0, maxResults)
      .map((item) => item.blueprint);
  }

  function getBlueprintMaterialRequirements(materials, materialEfficiency) {
    const efficiency = Number(materialEfficiency);
    if (!Array.isArray(materials) || !materials.length ||
      !Number.isFinite(efficiency) || efficiency < 0 || efficiency > 10) {
      throw new RangeError("Blueprint materials and material efficiency must be valid.");
    }
    return materials.reduce((requirements, material) => {
      const baseQuantity = Number(material.baseRequiredQuantity);
      if (!material.name || !Number.isFinite(baseQuantity) || baseQuantity < 0) {
        throw new RangeError("Blueprint material quantities must be valid.");
      }
      requirements[material.name] = (requirements[material.name] || 0)
        + Math.ceil(baseQuantity * (1 - efficiency / 100));
      return requirements;
    }, {});
  }

  function getBlueprintPlan(blueprint, requestedQuantity, materialEfficiency = 0) {
    const quantity = Math.ceil(Number(requestedQuantity));
    const outputQuantity = Number(blueprint?.outputQuantity);
    const efficiency = Number(materialEfficiency);
    if (!Number.isFinite(quantity) || quantity <= 0 ||
      !Number.isFinite(outputQuantity) || outputQuantity <= 0 ||
      !Number.isFinite(efficiency) || efficiency < 0 || efficiency > 10 ||
      !Array.isArray(blueprint?.materials) || !blueprint.materials.length) {
      throw new RangeError("Blueprint and requested product quantity must be valid.");
    }
    const runs = Math.ceil(quantity / outputQuantity);
    return {
      runs,
      requestedQuantity: quantity,
      producedQuantity: runs * outputQuantity,
      materialEfficiency: efficiency,
      materials: blueprint.materials.map((material) => {
        const baseRequiredQuantity = Number(material.quantity) * runs;
        return {
          ...material,
          baseRequiredQuantity,
          requiredQuantity: getBlueprintMaterialRequirements(
            [{ name: material.name, baseRequiredQuantity }], efficiency
          )[material.name]
        };
      })
    };
  }

  function getRequirements(projects) {
    const totals = {};
    for (const project of projects.filter((item) => item.active)) {
      for (const [mineral, amount] of Object.entries(project.requirements || {})) {
        totals[mineral] = (totals[mineral] || 0) + Math.max(0, Number(amount) || 0);
      }
    }
    return totals;
  }

  function allocateMinerals(projects, collected) {
    const allocations = Object.fromEntries(projects.map((project) => [project.id, {}]));
    const active = projects.filter((project) => project.active)
      .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);

    for (const [mineral, rawAmount] of Object.entries(collected || {})) {
      let remaining = Math.max(0, Number(rawAmount) || 0);
      for (const project of active) {
        const required = Math.max(0, Number(project.requirements?.[mineral]) || 0);
        const assigned = Math.min(required, remaining);
        allocations[project.id][mineral] = assigned;
        remaining -= assigned;
      }
    }
    return allocations;
  }

  function getProgress(project, allocation) {
    const required = Object.values(project.requirements || {})
      .reduce((sum, amount) => sum + Math.max(0, Number(amount) || 0), 0);
    if (!required) return 0;
    const fulfilled = Object.entries(project.requirements || {}).reduce(
      (sum, [mineral, amount]) => sum + Math.min(
        Math.max(0, Number(amount) || 0),
        Math.max(0, Number(allocation?.[mineral]) || 0)
      ), 0
    );
    return Math.min(100, (fulfilled / required) * 100);
  }

  function getGroupProgress(requirements, collected) {
    const required = Object.values(requirements).reduce((sum, amount) => sum + amount, 0);
    if (!required) return 0;
    const fulfilled = Object.entries(requirements).reduce(
      (sum, [mineral, amount]) => sum + Math.min(amount, Math.max(0, Number(collected[mineral]) || 0)), 0
    );
    return Math.min(100, (fulfilled / required) * 100);
  }

  function getOverflow(requirements, collected) {
    return Object.fromEntries(Object.entries(collected || {}).flatMap(([mineral, amount]) => {
      const overflow = Math.max(0, (Number(amount) || 0) - (requirements[mineral] || 0));
      return overflow > 0 ? [[mineral, overflow]] : [];
    }));
  }

  function recommendOres(requirements, collected, ores, efficiency) {
    const deficits = Object.entries(requirements)
      .map(([mineral, required]) => ({
        mineral,
        amount: Math.max(0, required - (Number(collected[mineral]) || 0)),
        share: required > 0 ? Math.max(0, required - (Number(collected[mineral]) || 0)) / required : 0
      }))
      .filter((item) => item.amount > 0)
      .sort((a, b) => b.share - a.share || b.amount - a.amount);
    if (!deficits.length) return [];

    const critical = deficits[0];
    return ores.map((ore) => {
      const output = Math.max(0, Number(ore.yields?.[critical.mineral]) || 0) * efficiency / 100;
      const batchVolume = Number(ore.batchVolume) || Number(ore.volume);
      const portionSize = Number(ore.portionSize) || 1;
      if (!output || !batchVolume || batchVolume <= 0 || portionSize <= 0) return null;
      const batches = Math.ceil(critical.amount / output);
      const volume = batches * batchVolume;
      return {
        ...ore,
        mineral: critical.mineral,
        deficit: critical.amount,
        outputPerBatch: output,
        batchVolume,
        batches,
        rawUnits: batches * portionSize,
        estimatedOutput: batches * output,
        volume,
        trips: null
      };
    }).filter(Boolean).sort((a, b) => a.volume - b.volume);
  }

  return {
    MINERALS,
    searchBlueprints,
    getBlueprintMaterialRequirements,
    getBlueprintPlan,
    getRequirements,
    allocateMinerals,
    getProgress,
    getGroupProgress,
    getOverflow,
    recommendOres
  };
});
