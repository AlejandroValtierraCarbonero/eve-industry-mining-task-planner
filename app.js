(function () {
  "use strict";

  const isTestingEnvironment = window.location.pathname.split("/").includes("testing");
  const STORAGE_KEY = isTestingEnvironment
    ? "eve-industry-planner-testing-v1"
    : "eve-industry-planner-v1";
  const { MINERALS } = window.EvePlanner;
  const MATERIAL_VOLUME_BY_NAME = new Map();
  const MATERIAL_ENGLISH_NAME_BY_NAME = new Map();
  const defaultState = () => ({
    projects: [],
    ores: [],
    collected: {},
    minedOres: {},
    selectedOres: [],
    oreMiningMineralBaseline: null,
    settings: {
      efficiency: 100,
      holdCapacity: 100000,
      mineralVolume: 0.01
    }
  });
  let state = defaultState();
  let noticeTimer;
  let blueprintCatalog = [];
  let sdeOres = [];
  let selectedBlueprint = null;
  let projectBlueprintDraft = null;
  let searchTimer;

  const $ = (selector) => document.querySelector(selector);
  const ids = {
    projectRows: $("#project-material-rows"),
    projectList: $("#project-list"),
    collectionTable: $("#collection-table"),
    progressList: $("#progress-list"),
    oreList: $("#ore-list"),
    recommendation: $("#ore-recommendation"),
    recommendedOreSelect: $("#recommended-ore"),
    oreCatalogList: $("#ore-catalog-list")
  };

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function loadState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return defaultState();
      const parsed = JSON.parse(stored);
      const efficiency = Number(parsed.settings?.efficiency);
      const legacyMaterialEfficiency = Number(parsed.settings?.materialEfficiency);
      const holdCapacity = Number(parsed.settings?.holdCapacity);
      const mineralVolume = Number(parsed.settings?.mineralVolume);
      const collected = parsed.collected && typeof parsed.collected === "object" ? parsed.collected : {};
      const minedOres = parsed.minedOres && typeof parsed.minedOres === "object" ? parsed.minedOres : {};
      const oreMiningMineralBaseline = parsed.oreMiningMineralBaseline &&
        typeof parsed.oreMiningMineralBaseline === "object"
        ? parsed.oreMiningMineralBaseline
        : Object.keys(minedOres).length ? { ...collected } : null;
      const projects = (Array.isArray(parsed.projects) ? parsed.projects : []).map((project) => {
        if (!Array.isArray(project.blueprintBaseMaterials)) return project;
        const savedEfficiency = Number(project.blueprintMaterialEfficiency);
        const materialEfficiency = Number.isFinite(savedEfficiency)
          ? clamp(savedEfficiency, 0, 10)
          : clamp(Number.isFinite(legacyMaterialEfficiency) ? legacyMaterialEfficiency : 0, 0, 10);
        const migratedProject = { ...project, blueprintMaterialEfficiency: materialEfficiency };
        try {
          migratedProject.requirements = window.EvePlanner.getBlueprintMaterialRequirements(
            project.blueprintBaseMaterials, materialEfficiency
          );
        } catch (error) {
          console.error(`No se pudo migrar la ME de ${project.name}:`, error);
          return migratedProject;
        }
        return migratedProject;
      });
      return {
        projects,
        ores: Array.isArray(parsed.ores) ? parsed.ores : [],
        collected,
        minedOres,
        selectedOres: Array.isArray(parsed.selectedOres)
          ? parsed.selectedOres.filter((key) => typeof key === "string")
          : Object.keys(minedOres),
        oreMiningMineralBaseline,
        settings: {
          efficiency: clamp(Number.isFinite(efficiency) ? efficiency : 100, 0, 100),
          holdCapacity: Number.isFinite(holdCapacity) && holdCapacity > 0 ? holdCapacity : 100000,
          mineralVolume: Number.isFinite(mineralVolume) && mineralVolume > 0 ? mineralVolume : 0.01
        }
      };
    } catch (error) {
      showNotice("No se pudieron leer los datos guardados. Se iniciará una sesión vacía.", true);
      console.error("Error al cargar los datos locales:", error);
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      showNotice("No se pudieron guardar los cambios en el navegador.", true);
      console.error("Error al guardar los datos locales:", error);
    }
  }

  function clamp(number, min, max) {
    return Math.min(max, Math.max(min, number));
  }

  function showNotice(message, isError) {
    const notice = $("#notice");
    notice.textContent = message;
    notice.classList.toggle("error", Boolean(isError));
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 4500);
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(value);
  }

  function getOreTrackingKey(ore) {
    return ore.typeId !== undefined ? `sde:${ore.typeId}` : `custom:${ore.id}`;
  }

  function normalizeOreSearch(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  }

  function addMaterialRow(container, initialMineral) {
    const row = document.createElement("div");
    row.className = "material-row";
    row.innerHTML = `<input aria-label="Material" list="material-options" placeholder="Nombre del material" required><input aria-label="Cantidad requerida" type="number" min="1" step="1" placeholder="Cantidad" required><button class="remove-row" type="button" aria-label="Eliminar material">×</button>`;
    const materialInput = row.querySelector('[aria-label="Material"]');
    materialInput.value = initialMineral || "";
    materialInput.addEventListener("input", () => {
      materialInput.dataset.volume = "";
      materialInput.dataset.englishName = "";
      projectBlueprintDraft = null;
    });
    row.querySelector('[aria-label="Cantidad requerida"]').addEventListener("input", () => {
      projectBlueprintDraft = null;
    });
    row.querySelector(".remove-row").addEventListener("click", () => {
      if (container.children.length > 1) row.remove();
      else showNotice("Cada proyecto debe tener al menos un material.", true);
    });
    container.append(row);
  }

  function initializeBlueprintCatalog() {
    const searchInput = $("#blueprint-search");
    const results = $("#blueprint-search-results");
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      selectedBlueprint = null;
      $("#blueprint-selection").hidden = true;
      searchTimer = setTimeout(() => renderBlueprintSearch(searchInput.value), 120);
    });
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        results.hidden = true;
        searchInput.setAttribute("aria-expanded", "false");
      } else if (event.key === "Enter" && !results.hidden) {
        const firstResult = results.querySelector("button[data-index]");
        if (firstResult) {
          event.preventDefault();
          firstResult.click();
        }
      }
    });
    results.addEventListener("click", (event) => {
      const option = event.target.closest("button[data-index]");
      if (!option) return;
      selectedBlueprint = blueprintCatalog[Number(option.dataset.index)];
      if (!selectedBlueprint) return;
      searchInput.value = selectedBlueprint.name;
      $("#blueprint-material-efficiency").value = "0";
      results.hidden = true;
      searchInput.setAttribute("aria-expanded", "false");
      $("#blueprint-search-empty").hidden = true;
      renderBlueprintSelection();
    });
    $("#blueprint-quantity").addEventListener("input", renderBlueprintSelection);
    $("#blueprint-material-efficiency").addEventListener("change", (event) => {
      const value = Number(event.target.value);
      if (event.target.value === "" || !Number.isFinite(value) || value < 0 || value > 10) {
        event.target.value = projectBlueprintDraft?.blueprintTypeId === selectedBlueprint?.blueprintTypeId
          ? projectBlueprintDraft.materialEfficiency
          : 0;
        showNotice("La eficiencia de materiales debe estar entre 0 y 10 %.", true);
        return;
      }
      if (projectBlueprintDraft?.blueprintTypeId === selectedBlueprint?.blueprintTypeId) {
        projectBlueprintDraft.materialEfficiency = value;
        refreshBlueprintDraftMaterials();
      }
      renderBlueprintSelection();
    });
    $("#clear-blueprint").addEventListener("click", () => {
      selectedBlueprint = null;
      searchInput.value = "";
      $("#blueprint-selection").hidden = true;
      results.hidden = true;
      searchInput.setAttribute("aria-expanded", "false");
      searchInput.focus();
    });
    $("#apply-blueprint").addEventListener("click", applyBlueprintToProjectForm);
    loadBlueprintCatalog();
  }

  async function loadBlueprintCatalog() {
    const status = $("#sde-catalog-status");
    try {
      const response = await fetch("sde-blueprints.json", { cache: "no-cache" });
      if (!response.ok) throw new Error(`SDE catalog request failed (${response.status}).`);
      const catalog = await response.json();
      if (!catalog || !Array.isArray(catalog.blueprints) || !catalog.blueprints.length ||
        !Array.isArray(catalog.ores) || !catalog.ores.length) {
        throw new Error("SDE catalog contains no blueprint products or asteroid ores.");
      }
      blueprintCatalog = catalog.blueprints;
      sdeOres = catalog.ores;
      for (const blueprint of blueprintCatalog) {
        for (const material of blueprint.materials) {
          if (material.name && material.englishName) {
            MATERIAL_ENGLISH_NAME_BY_NAME.set(material.name, material.englishName);
          }
          if (material.name && Number.isFinite(Number(material.volume)) && Number(material.volume) > 0) {
            MATERIAL_VOLUME_BY_NAME.set(material.name, Number(material.volume));
          }
        }
      }
      status.textContent = `${formatNumber(blueprintCatalog.length)} productos · ${formatNumber(sdeOres.length)} menas · SDE ${catalog.buildNumber}`;
      status.title = "Catálogo derivado del EVE Online Static Data Export oficial.";
      $("#blueprint-search").disabled = false;
      render();
    } catch (error) {
      status.textContent = "Catálogo no disponible";
      status.title = error.message;
      console.error("Error al cargar el catálogo SDE:", error);
      showNotice("No se pudo cargar el catálogo SDE. Prueba de nuevo más tarde.", true);
    }
  }

  function renderBlueprintSearch(query) {
    const results = $("#blueprint-search-results");
    const matches = window.EvePlanner.searchBlueprints(blueprintCatalog, query, 10);
    const empty = $("#blueprint-search-empty");
    results.innerHTML = matches.map((blueprint) => {
      const index = blueprintCatalog.indexOf(blueprint);
      const englishName = blueprint.englishName && blueprint.englishName !== blueprint.name
        ? `<span>${escapeHtml(blueprint.englishName)}</span>`
        : "";
      return `<button type="button" role="option" class="blueprint-result" data-index="${index}">
        <strong>${escapeHtml(blueprint.name)}</strong>${englishName}
      </button>`;
    }).join("");
    results.hidden = !matches.length;
    empty.hidden = !String(query).trim() || matches.length > 0;
    $("#blueprint-search").setAttribute("aria-expanded", String(matches.length > 0));
  }

  function renderBlueprintSelection() {
    if (!selectedBlueprint) return;
    const requestedQuantity = Number($("#blueprint-quantity").value);
    const rawEfficiency = $("#blueprint-material-efficiency").value;
    let plan;
    try {
      plan = window.EvePlanner.getBlueprintPlan(
        selectedBlueprint, requestedQuantity, rawEfficiency === "" ? NaN : Number(rawEfficiency)
      );
    } catch {
      $("#blueprint-plan-summary").textContent = "Introduce una cantidad y una ME válidas.";
      $("#blueprint-material-preview").replaceChildren();
      $("#blueprint-selection").hidden = false;
      return;
    }
    $("#selected-blueprint-name").textContent = selectedBlueprint.name;
    $("#selected-blueprint-english").textContent =
      selectedBlueprint.englishName !== selectedBlueprint.name ? selectedBlueprint.englishName : "";
    $("#blueprint-plan-summary").textContent =
      `${formatNumber(plan.runs)} ${plan.runs === 1 ? "lote" : "lotes"} · ${formatNumber(plan.producedQuantity)} unidades · ME ${formatNumber(plan.materialEfficiency)} %. Se redondea hacia arriba el total de cada material.`;
    $("#blueprint-material-preview").innerHTML = plan.materials.map((material) =>
      `<li>${escapeHtml(material.name)} <span>${formatNumber(material.requiredQuantity)}${plan.materialEfficiency > 0
        ? ` <small>(base ${formatNumber(material.baseRequiredQuantity)})</small>` : ""}</span></li>`
    ).join("");
    $("#blueprint-selection").hidden = false;
  }

  function applyBlueprintToProjectForm() {
    if (!selectedBlueprint) return;
    try {
      const rawEfficiency = $("#blueprint-material-efficiency").value;
      const plan = window.EvePlanner.getBlueprintPlan(
        selectedBlueprint,
        Number($("#blueprint-quantity").value),
        rawEfficiency === "" ? NaN : Number(rawEfficiency)
      );
      $("#project-name").value = `${formatNumber(plan.requestedQuantity)} × ${selectedBlueprint.name}`;
      projectBlueprintDraft = {
        blueprintTypeId: selectedBlueprint.blueprintTypeId,
        blueprintName: selectedBlueprint.blueprintName,
        materialEfficiency: plan.materialEfficiency,
        outputQuantity: selectedBlueprint.outputQuantity,
        requestedQuantity: plan.requestedQuantity,
        materials: plan.materials.map((material) => ({
          name: material.name,
          englishName: material.englishName,
          volume: material.volume,
          baseRequiredQuantity: material.baseRequiredQuantity
        }))
      };
      ids.projectRows.replaceChildren();
      for (const material of plan.materials) {
        addMaterialRow(ids.projectRows, material.name);
        const row = ids.projectRows.lastElementChild;
        const input = row.querySelector('[aria-label="Material"]');
        input.dataset.volume = material.volume ?? "";
        input.dataset.englishName = material.englishName ?? material.name;
        row.querySelector('[aria-label="Cantidad requerida"]').value = material.requiredQuantity;
      }
      $("#project-name").focus();
      showNotice(`Materiales base de ${selectedBlueprint.name} cargados en el formulario.`);
    } catch (error) {
      showNotice(error.message, true);
    }
  }

  function recalculateBlueprintProjects() {
    for (const project of state.projects) {
      if (!Array.isArray(project.blueprintBaseMaterials)) continue;
      try {
        project.requirements = window.EvePlanner.getBlueprintMaterialRequirements(
          project.blueprintBaseMaterials, project.blueprintMaterialEfficiency
        );
      } catch (error) {
        console.error(`No se pudieron recalcular los materiales de ${project.name}:`, error);
      }
    }
  }

  function refreshBlueprintDraftMaterials() {
    if (!projectBlueprintDraft) return;
    for (const [index, material] of projectBlueprintDraft.materials.entries()) {
      const quantityInput = ids.projectRows.children[index]
        ?.querySelector('[aria-label="Cantidad requerida"]');
      if (quantityInput) {
        quantityInput.value = window.EvePlanner.getBlueprintMaterialRequirements(
          [material], projectBlueprintDraft.materialEfficiency
        )[material.name];
      }
    }
  }

  function initializeForms() {
    addMaterialRow(ids.projectRows, "Tritanium");
    $("#material-options").innerHTML = MINERALS.map((mineral) =>
      `<option value="${mineral}"></option>`
    ).join("");
    initializeBlueprintCatalog();

    $("#add-project-material").addEventListener("click", () => {
      projectBlueprintDraft = null;
      addMaterialRow(ids.projectRows);
    });
    $("#project-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const name = form.elements.name.value.trim();
      const requirements = {};
      const materialVolumes = {};
      const materialEnglishNames = {};
      let valid = true;
      for (const row of ids.projectRows.children) {
        const materialInput = row.querySelector('[aria-label="Material"]');
        const materialName = materialInput.value.trim();
        const amount = Number(row.querySelector('[aria-label="Cantidad requerida"]').value);
        if (!materialName || !Number.isFinite(amount) || amount <= 0) valid = false;
        requirements[materialName] = (requirements[materialName] || 0) + amount;
        const volume = Number(materialInput.dataset.volume);
        if (Number.isFinite(volume) && volume > 0) materialVolumes[materialName] = volume;
        if (materialInput.dataset.englishName) {
          materialEnglishNames[materialName] = materialInput.dataset.englishName;
        }
      }
      if (!name || !valid) {
        showNotice("Indica un nombre y materiales con cantidades válidas.", true);
        return;
      }
      state.projects.push({
        id: crypto.randomUUID(),
        name,
        priority: Number(form.elements.priority.value),
        active: form.elements.active.checked,
        requirements,
        materialVolumes,
        materialEnglishNames,
        blueprintBaseMaterials: projectBlueprintDraft?.materials,
        blueprintMaterialEfficiency: projectBlueprintDraft?.materialEfficiency,
        blueprintTypeId: projectBlueprintDraft?.blueprintTypeId,
        blueprintName: projectBlueprintDraft?.blueprintName,
        createdAt: Date.now()
      });
      form.reset();
      form.elements.priority.value = "2";
      form.elements.active.checked = true;
      ids.projectRows.replaceChildren();
      addMaterialRow(ids.projectRows, "Tritanium");
      projectBlueprintDraft = null;
      selectedBlueprint = null;
      $("#blueprint-selection").hidden = true;
      $("#blueprint-search-results").hidden = true;
      $("#blueprint-search").value = "";
      saveState();
      render();
      showNotice("Proyecto añadido al plan.");
    });

    $("#collection-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const mineral = event.currentTarget.elements.mineral.value;
      const amount = Number(event.currentTarget.elements.amount.value);
      if (!Number.isFinite(amount) || amount <= 0) {
        showNotice("Introduce una cantidad mayor que cero.", true);
        return;
      }
      state.collected[mineral] = (Number(state.collected[mineral]) || 0) + amount;
      event.currentTarget.reset();
      saveState();
      render();
      showNotice(state.oreMiningMineralBaseline
        ? `${formatNumber(amount)} unidades de ${mineral} registradas. Al terminar el reprocesado de la mena, finaliza también su ciclo para actualizar el plan.`
        : `${formatNumber(amount)} unidades de ${mineral} registradas.`);
    });

    $("#ore-collection-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const oreKey = form.elements.ore.value;
      const amount = Number(form.elements.amount.value);
      if (!oreKey || !Number.isFinite(amount) || amount <= 0) {
        showNotice("Selecciona una mena e introduce una cantidad mayor que cero.", true);
        return;
      }
      if (!state.oreMiningMineralBaseline) {
        state.oreMiningMineralBaseline = { ...state.collected };
      }
      state.minedOres[oreKey] = (Number(state.minedOres[oreKey]) || 0) + amount;
      form.elements.amount.value = "";
      saveState();
      render();
      showNotice(`${formatNumber(amount)} unidades de mena registradas.`);
    });

    $("#clear-collection").addEventListener("click", () => {
      if (!Object.keys(state.collected).length) {
        showNotice("El registro de recolección ya está vacío.");
        return;
      }
      if (!window.confirm("¿Vaciar todas las cantidades recolectadas? Esta acción no se puede deshacer.")) return;
      state.collected = {};
      state.oreMiningMineralBaseline = {};
      saveState();
      render();
      showNotice("Registro de recolección vaciado.");
    });

    $("#add-ore-toggle").addEventListener("click", () => {
      $("#ore-form").hidden = false;
      $("#ore-form").elements.name.focus();
    });
    $("#cancel-ore").addEventListener("click", () => {
      $("#ore-form").reset();
      $("#ore-form").hidden = true;
    });
    $("#ore-form").addEventListener("submit", handleOreSubmit);

    $("#ore-security-filter").addEventListener("change", renderOres);
    $("#ore-search").addEventListener("input", renderOres);
    ids.oreCatalogList.addEventListener("change", (event) => {
      const checkbox = event.target.closest("input[data-ore-key]");
      if (!checkbox) return;
      const key = checkbox.dataset.oreKey;
      state.selectedOres = checkbox.checked
        ? [...new Set([...state.selectedOres, key])]
        : state.selectedOres.filter((selectedKey) => selectedKey !== key);
      saveState();
      renderOres();
    });
    $("#select-visible-ores").addEventListener("click", () => {
      const visibleKeys = getVisibleOres(getOreCatalog()).map((ore) => ore.key);
      state.selectedOres = [...new Set([...state.selectedOres, ...visibleKeys])];
      saveState();
      renderOres();
    });
    $("#clear-selected-ores").addEventListener("click", () => {
      const visibleKeys = new Set(getVisibleOres(getOreCatalog()).map((ore) => ore.key));
      state.selectedOres = state.selectedOres.filter((key) => !visibleKeys.has(key));
      saveState();
      renderOres();
    });
    $("#finish-ore-processing").addEventListener("click", () => {
      if (!Object.values(state.minedOres).some((amount) => Number(amount) > 0)) {
        showNotice("No hay mena registrada que finalizar.");
        return;
      }
      if (!window.confirm(
        "Confirma que has reprocesado toda la mena registrada y apuntado los minerales obtenidos en Recolección. Se reiniciará el registro de mena y se usará el inventario actual de minerales como nueva base."
      )) return;
      state.minedOres = {};
      state.oreMiningMineralBaseline = { ...state.collected };
      saveState();
      render();
      showNotice("Ciclo de reprocesado finalizado. El plan de mena ahora parte de los minerales registrados.");
    });

    $("#efficiency").addEventListener("change", (event) => {
      const value = Number(event.target.value);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        event.target.value = state.settings.efficiency;
        showNotice("La eficiencia debe estar entre 0 y 100 %.", true);
        return;
      }
      state.settings.efficiency = value;
      saveState();
      render();
    });
    $("#hold-capacity").addEventListener("change", (event) => {
      const value = Number(event.target.value);
      if (!Number.isFinite(value) || value <= 0) {
        event.target.value = state.settings.holdCapacity;
        showNotice("La capacidad de carga debe ser mayor que cero.", true);
        return;
      }
      state.settings.holdCapacity = value;
      saveState();
      render();
    });
    $("#mineral-volume").addEventListener("change", (event) => {
      const value = Number(event.target.value);
      if (!Number.isFinite(value) || value <= 0) {
        event.target.value = state.settings.mineralVolume;
        showNotice("El volumen por unidad debe ser mayor que cero.", true);
        return;
      }
      state.settings.mineralVolume = value;
      saveState();
      render();
    });
  }

  function handleOreSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = form.elements.name.value.trim();
    const volume = Number(form.elements.volume.value);
    const portionSize = Number(form.elements.portionSize.value);
    const securityZone = form.elements.securityZone.value;
    const yields = {};
    for (const line of form.elements.yields.value.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const separator = line.lastIndexOf(":");
      if (separator <= 0) {
        showNotice("Usa el formato «Mineral: cantidad», una composición por línea.", true);
        return;
      }
      const mineral = line.slice(0, separator).trim();
      const amount = Number(line.slice(separator + 1).trim());
      if (!MINERALS.includes(mineral) || !Number.isFinite(amount) || amount <= 0) {
        showNotice(`Revisa el mineral o la cantidad de la línea «${line.trim()}».`, true);
        return;
      }
      yields[mineral] = (yields[mineral] || 0) + amount;
    }
    if (!name || !Number.isFinite(volume) || volume <= 0 ||
      !Number.isInteger(portionSize) || portionSize <= 0 || !Object.keys(yields).length) {
      showNotice("Completa el nombre, el volumen, las unidades por lote y al menos un rendimiento válidos.", true);
      return;
    }
    state.ores.push({
      id: crypto.randomUUID(),
      name,
      system: form.elements.system.value.trim(),
      securityZones: securityZone === "unclassified" ? ["unclassified"] : [securityZone],
      volume,
      portionSize,
      yields
    });
    const key = getOreTrackingKey(state.ores[state.ores.length - 1]);
    state.selectedOres = [...new Set([...state.selectedOres, key])];
    form.reset();
    form.hidden = true;
    saveState();
    render();
    showNotice("Perfil de mena guardado.");
  }

  function renderProjects(requirements, allocations) {
    ids.projectList.innerHTML = state.projects.map((project) => {
      const progress = window.EvePlanner.getProgress(project, allocations[project.id]);
      const materialText = Object.entries(project.requirements)
        .map(([mineral, amount]) => `${escapeHtml(mineral)}: ${formatNumber(amount)}`).join(" · ");
      const priority = { 3: "ALTA", 2: "MEDIA", 1: "BAJA" }[project.priority] || "MEDIA";
      return `<article class="project-card ${project.active ? "" : "inactive"}">
        <div class="project-title-row"><strong class="project-name">${escapeHtml(project.name)}</strong><span class="priority-tag">${priority}</span></div>
        ${Array.isArray(project.blueprintBaseMaterials) ? `<label class="project-me-field">ME del plano (${escapeHtml(project.blueprintName || "blueprint")}, %)<input type="number" min="0" max="10" step="0.1" required value="${escapeHtml(project.blueprintMaterialEfficiency ?? 0)}" data-action="set-blueprint-me" data-id="${escapeHtml(project.id)}" aria-label="ME del plano para ${escapeHtml(project.name)}"></label>` : ""}
        <p class="project-materials">${materialText}</p>
        <div class="project-meta"><span>${project.active ? `${formatNumber(progress)}% completado` : "Fuera del grupo actual"}</span>
          <div class="project-controls"><button class="toggle-button" type="button" data-action="toggle" data-id="${escapeHtml(project.id)}">${project.active ? "Desactivar" : "Activar"}</button><button class="delete-button" type="button" data-action="delete" data-id="${escapeHtml(project.id)}">Eliminar</button></div>
        </div>
        <div class="progress-track"><span style="width:${project.active ? progress : 0}%"></span></div>
      </article>`;
    }).join("");
    $("#empty-projects").hidden = state.projects.length > 0;
    $("#project-count").textContent = String(state.projects.length);
    ids.projectList.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const project = state.projects.find((item) => item.id === button.dataset.id);
        if (!project) return;
        if (button.dataset.action === "toggle") project.active = !project.active;
        else {
          state.projects = state.projects.filter((item) => item.id !== project.id);
        }
        saveState();
        render();
      });
    });
    ids.projectList.querySelectorAll('input[data-action="set-blueprint-me"]').forEach((input) => {
      input.addEventListener("change", () => {
        const project = state.projects.find((item) => item.id === input.dataset.id);
        const value = Number(input.value);
        if (!project || input.value === "" || !Number.isFinite(value) || value < 0 || value > 10) {
          input.value = project?.blueprintMaterialEfficiency ?? 0;
          showNotice("La eficiencia de materiales debe estar entre 0 y 10 %.", true);
          return;
        }
        project.blueprintMaterialEfficiency = value;
        recalculateBlueprintProjects();
        saveState();
        render();
      });
    });
  }

  function renderCollection(requirements, allocations) {
    const collectedSelect = $("#collected-mineral");
    const previousSelection = collectedSelect.value;
    const materialNames = [...new Set([
      ...MINERALS,
      ...Object.keys(requirements),
      ...Object.keys(state.collected)
    ])].sort((a, b) => {
      const aIndex = MINERALS.indexOf(a);
      const bIndex = MINERALS.indexOf(b);
      if (aIndex !== -1 || bIndex !== -1) {
        return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex)
          - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
      }
      return a.localeCompare(b);
    });
    collectedSelect.innerHTML = materialNames.map((name) =>
      `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`
    ).join("");
    if (materialNames.includes(previousSelection)) collectedSelect.value = previousSelection;

    const minerals = [...new Set([...Object.keys(requirements), ...Object.keys(state.collected)])];
    ids.collectionTable.innerHTML = minerals.map((mineral) => {
      const required = requirements[mineral] || 0;
      const collected = Number(state.collected[mineral]) || 0;
      return `<tr><td>${escapeHtml(mineral)}</td><td>${formatNumber(required)}</td><td>${formatNumber(collected)}</td><td>${formatNumber(Math.max(0, required - collected))}</td></tr>`;
    }).join("");
    $("#empty-collection").hidden = minerals.length > 0;
    const overflow = window.EvePlanner.getOverflow(requirements, state.collected);
    const overflowEntries = Object.entries(overflow);
    const overflowBox = $("#overflow");
    overflowBox.hidden = !overflowEntries.length;
    overflowBox.textContent = overflowEntries.length
      ? `EXCEDENTES · ${overflowEntries.map(([mineral, amount]) => `${mineral}: ${formatNumber(amount)}`).join(" · ")}`
      : "";

    const volumeTotals = {};
    for (const project of state.projects.filter((item) => item.active)) {
      for (const [material, amount] of Object.entries(project.requirements || {})) {
        const unitVolume = Number(project.materialVolumes?.[material])
          || MATERIAL_VOLUME_BY_NAME.get(material)
          || state.settings.mineralVolume;
        volumeTotals[material] = (volumeTotals[material] || 0) + amount * unitVolume;
      }
    }
    const pendingVolume = Object.entries(requirements).reduce((sum, [material, required]) => {
      const unitVolume = required > 0
        ? (volumeTotals[material] || 0) / required
        : state.settings.mineralVolume;
      return sum + Math.max(0, required - (Number(state.collected[material]) || 0)) * unitVolume;
    }, 0);
    const trips = pendingVolume ? Math.ceil(pendingVolume / state.settings.holdCapacity) : 0;
    $("#collection-volume").textContent = `Volumen de materiales pendiente: ${formatNumber(pendingVolume)} m³ · ${trips === 1 ? "1 viaje estimado" : `${trips} viajes estimados`}`;

    const activeProjects = state.projects.filter((project) => project.active);
    ids.progressList.innerHTML = activeProjects.map((project) => {
      const progress = window.EvePlanner.getProgress(project, allocations[project.id]);
      return `<div class="progress-item"><span class="progress-name">${escapeHtml(project.name)}</span><span class="progress-percent">${formatNumber(progress)}%</span><div class="progress-track"><span style="width:${progress}%"></span></div></div>`;
    }).join("");
    $("#empty-progress").hidden = activeProjects.length > 0;
  }

  function renderOres() {
    const mineralRequirements = {};
    const mineralCollected = {};
    const canonicalMineral = (material) =>
      MATERIAL_ENGLISH_NAME_BY_NAME.get(material) || material;
    for (const project of state.projects.filter((item) => item.active)) {
      for (const [material, amount] of Object.entries(project.requirements || {})) {
        const mineral = project.materialEnglishNames?.[material] || canonicalMineral(material);
        if (MINERALS.includes(mineral)) {
          mineralRequirements[mineral] = (mineralRequirements[mineral] || 0) + amount;
        }
      }
    }
    const orePlanBaseline = state.oreMiningMineralBaseline || state.collected;
    for (const [material, amount] of Object.entries(orePlanBaseline)) {
      const mineral = canonicalMineral(material);
      if (MINERALS.includes(mineral)) {
        mineralCollected[mineral] = (mineralCollected[mineral] || 0) + amount;
      }
    }
    const oreCatalog = getOreCatalog();
    const selectedKeys = new Set(state.selectedOres);
    const selectedOres = oreCatalog.filter((ore) =>
      selectedKeys.has(ore.key) || Number(state.minedOres[ore.key]) > 0
    );
    const plan = window.EvePlanner.planOreCollection(
      mineralRequirements,
      mineralCollected,
      oreCatalog,
      selectedOres.map((ore) => ore.key),
      state.minedOres,
      state.settings.efficiency
    );
    ids.recommendedOreSelect.innerHTML = plan.map((ore) =>
      `<option value="${escapeHtml(ore.key)}">${escapeHtml(ore.name)} · ${escapeHtml(ore.source)}</option>`
    ).join("");
    ids.recommendedOreSelect.disabled = plan.length === 0;
    ids.recommendation.innerHTML = plan.map((ore) =>
      `<tr><td>${escapeHtml(ore.name)}<small class="ore-source">${escapeHtml(ore.source)} · ${formatNumber(ore.batches)} ${ore.batches === 1 ? "lote adicional" : "lotes adicionales"} · ${formatNumber(ore.volume)} m³ estimados</small></td><td>${ore.mineral ? escapeHtml(ore.mineral) : "—"}</td><td>${formatNumber(ore.requiredUnits)}</td><td>${formatNumber(ore.minedUnits)}</td><td>${formatNumber(ore.pendingUnits)}</td></tr>`
    ).join("");
    renderOreCatalog(oreCatalog);
    const emptyOreTable = $("#empty-ore-recommendation");
    emptyOreTable.hidden = plan.length > 0;
    emptyOreTable.textContent = !Object.keys(mineralRequirements).length
      ? "Activa un proyecto con minerales pendientes para calcular las cantidades de mena."
      : !state.settings.efficiency
        ? "Configura una eficiencia de reprocesamiento mayor que 0 % para estimar las cantidades de mena."
        : state.selectedOres.length || Object.keys(state.minedOres).length
          ? "No hay menas seleccionadas con cantidades registradas."
          : "Selecciona en el catálogo las menas que tienes disponibles.";
    const minedCount = Object.values(state.minedOres).filter((amount) => Number(amount) > 0).length;
    $("#finish-ore-processing").disabled = minedCount === 0;
    $("#ore-cycle-status").textContent = minedCount
      ? `${formatNumber(minedCount)} ${minedCount === 1 ? "mena registrada" : "menas registradas"} · al reprocesarlas, registra sus minerales y finaliza el ciclo.`
      : "La mena minada se mantiene separada de los minerales reprocesados.";
    ids.oreList.innerHTML = state.ores.map((ore) =>
      `<div class="ore-chip"><span>${escapeHtml(ore.name)}${ore.system ? ` · ${escapeHtml(ore.system)}` : ""}</span><small>${formatNumber(ore.portionSize || 1)} unidades · ${formatNumber(ore.volume)} m³/lote</small><button type="button" data-id="${escapeHtml(ore.id)}" aria-label="Eliminar perfil de ${escapeHtml(ore.name)}">×</button></div>`
    ).join("");
    ids.oreList.querySelectorAll("button[data-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = `custom:${button.dataset.id}`;
        if (Number(state.minedOres[key]) > 0 && !window.confirm(
          "Esta mena tiene unidades minadas registradas. ¿Eliminar también su perfil y ese registro?"
        )) return;
        state.ores = state.ores.filter((ore) => ore.id !== button.dataset.id);
        state.selectedOres = state.selectedOres.filter((selectedKey) => selectedKey !== key);
        delete state.minedOres[key];
        saveState();
        render();
        showNotice("Perfil de mena eliminado.");
      });
    });
  }

  function getOreCatalog() {
    return [
      ...sdeOres.map((ore) => ({
        ...ore,
        key: getOreTrackingKey(ore),
        securityZones: ore.securityZones || ["unclassified"],
        source: "SDE oficial"
      })),
      ...state.ores.map((ore) => ({
        ...ore,
        key: getOreTrackingKey(ore),
        securityZones: ore.securityZones || ["unclassified"],
        source: "Personalizada"
      }))
    ];
  }

  function getVisibleOres(oreCatalog) {
    const zone = $("#ore-security-filter").value;
    const query = normalizeOreSearch($("#ore-search").value).trim();
    return oreCatalog.filter((ore) => {
      const matchesZone = zone === "all" || ore.securityZones.includes(zone);
      const searchableText = normalizeOreSearch(
        `${ore.name} ${ore.englishName || ""} ${ore.system || ""}`
      );
      return matchesZone && (!query || searchableText.includes(query));
    });
  }

  function renderOreCatalog(oreCatalog) {
    const visibleOres = getVisibleOres(oreCatalog);
    const selectedKeys = new Set(state.selectedOres);
    $("#ore-catalog-count").textContent =
      `${formatNumber(visibleOres.length)} visibles · ${formatNumber(state.selectedOres.length)} seleccionadas`;
    ids.oreCatalogList.innerHTML = visibleOres.map((ore) => {
      const checked = selectedKeys.has(ore.key);
      const zones = ore.securityZones.map((zone) => ({
        high: "Alta",
        medium: "Media",
        low: "Baja",
        null: "Nula",
        unclassified: "Sin clasificar"
      })[zone] || zone);
      return `<label class="ore-catalog-choice">
        <input type="checkbox" data-ore-key="${escapeHtml(ore.key)}"${checked ? " checked" : ""}>
        <span><strong>${escapeHtml(ore.name)}</strong><small>${escapeHtml(ore.source)} · ${escapeHtml(zones.join(", "))}${ore.system ? ` · ${escapeHtml(ore.system)}` : ""}</small></span>
      </label>`;
    }).join("");
    $("#empty-ore-catalog").hidden = visibleOres.length > 0;
  }

  function render() {
    const requirements = window.EvePlanner.getRequirements(state.projects);
    const allocations = window.EvePlanner.allocateMinerals(state.projects, state.collected);
    const progress = window.EvePlanner.getGroupProgress(requirements, state.collected);
    const pendingCount = Object.entries(requirements).reduce(
      (sum, [mineral, amount]) => sum + Math.max(0, amount - (Number(state.collected[mineral]) || 0)), 0
    );
    $("#summary-projects").textContent = String(state.projects.filter((project) => project.active).length);
    $("#summary-minerals").textContent = formatNumber(pendingCount);
    $("#summary-progress").textContent = `${formatNumber(progress)}%`;
    $("#summary-progress-bar").style.width = `${progress}%`;
    renderProjects(requirements, allocations);
    renderCollection(requirements, allocations);
    renderOres();
    $("#efficiency").value = state.settings.efficiency;
    $("#hold-capacity").value = state.settings.holdCapacity;
    $("#mineral-volume").value = state.settings.mineralVolume;
  }

  state = loadState();
  if (isTestingEnvironment) $("#environment-banner").hidden = false;
  initializeForms();
  render();
})();
