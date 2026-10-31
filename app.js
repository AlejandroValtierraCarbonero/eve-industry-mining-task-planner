(function () {
  "use strict";

  const STORAGE_KEY = "eve-industry-planner-v1";
  const { MINERALS } = window.EvePlanner;
  const defaultState = () => ({
    projects: [],
    ores: [],
    collected: {},
    settings: { efficiency: 100, holdCapacity: 100000, mineralVolume: 0.01 }
  });
  let state = defaultState();
  let noticeTimer;

  const $ = (selector) => document.querySelector(selector);
  const ids = {
    projectRows: $("#project-material-rows"),
    projectList: $("#project-list"),
    collectionTable: $("#collection-table"),
    progressList: $("#progress-list"),
    oreList: $("#ore-list"),
    recommendation: $("#ore-recommendation")
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
      const holdCapacity = Number(parsed.settings?.holdCapacity);
      const mineralVolume = Number(parsed.settings?.mineralVolume);
      return {
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        ores: Array.isArray(parsed.ores) ? parsed.ores : [],
        collected: parsed.collected && typeof parsed.collected === "object" ? parsed.collected : {},
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

  function addMaterialRow(container, initialMineral) {
    const row = document.createElement("div");
    row.className = "material-row";
    row.innerHTML = `<select aria-label="Mineral">${MINERALS.map((mineral) =>
      `<option value="${mineral}" ${mineral === initialMineral ? "selected" : ""}>${mineral}</option>`
    ).join("")}</select><input aria-label="Cantidad requerida" type="number" min="1" step="1" placeholder="Cantidad" required><button class="remove-row" type="button" aria-label="Eliminar mineral">×</button>`;
    row.querySelector(".remove-row").addEventListener("click", () => {
      if (container.children.length > 1) row.remove();
      else showNotice("Cada proyecto debe tener al menos un mineral.", true);
    });
    container.append(row);
  }

  function initializeForms() {
    addMaterialRow(ids.projectRows, "Tritanium");
    $("#collected-mineral").innerHTML = MINERALS.map((mineral) =>
      `<option value="${mineral}">${mineral}</option>`
    ).join("");

    $("#add-project-material").addEventListener("click", () => addMaterialRow(ids.projectRows));
    $("#project-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const name = form.elements.name.value.trim();
      const requirements = {};
      let valid = true;
      for (const row of ids.projectRows.children) {
        const mineral = row.querySelector("select").value;
        const amount = Number(row.querySelector("input").value);
        if (!Number.isFinite(amount) || amount <= 0) valid = false;
        requirements[mineral] = (requirements[mineral] || 0) + amount;
      }
      if (!name || !valid) {
        showNotice("Indica un nombre y cantidades válidas para todos los materiales.", true);
        return;
      }
      state.projects.push({
        id: crypto.randomUUID(),
        name,
        priority: Number(form.elements.priority.value),
        active: form.elements.active.checked,
        requirements,
        createdAt: Date.now()
      });
      form.reset();
      form.elements.priority.value = "2";
      form.elements.active.checked = true;
      ids.projectRows.replaceChildren();
      addMaterialRow(ids.projectRows, "Tritanium");
      saveState();
      render();
      showNotice("Proyecto añadido al plan.");
    });

    $("#collection-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const mineral = event.currentTarget.elements.mineral.value;
      const amount = Number(event.currentTarget.elements.amount.value);
      if (!Number.isFinite(amount) || amount <= 0) {
        showNotice("Introduce una cantidad de mineral mayor que cero.", true);
        return;
      }
      state.collected[mineral] = (Number(state.collected[mineral]) || 0) + amount;
      event.currentTarget.reset();
      saveState();
      render();
      showNotice(`${formatNumber(amount)} unidades de ${mineral} registradas.`);
    });

    $("#clear-collection").addEventListener("click", () => {
      if (!Object.keys(state.collected).length) {
        showNotice("El registro de recolección ya está vacío.");
        return;
      }
      if (!window.confirm("¿Vaciar todas las cantidades recolectadas? Esta acción no se puede deshacer.")) return;
      state.collected = {};
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
    if (!name || !Number.isFinite(volume) || volume <= 0 || !Object.keys(yields).length) {
      showNotice("Completa el nombre, un volumen válido y al menos un rendimiento.", true);
      return;
    }
    state.ores.push({
      id: crypto.randomUUID(),
      name,
      system: form.elements.system.value.trim(),
      volume,
      yields
    });
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
  }

  function renderCollection(requirements, allocations) {
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

    const pendingVolume = Object.entries(requirements).reduce(
      (sum, [mineral, required]) => sum + Math.max(0, required - (Number(state.collected[mineral]) || 0))
        * state.settings.mineralVolume, 0
    );
    const trips = pendingVolume ? Math.ceil(pendingVolume / state.settings.holdCapacity) : 0;
    $("#collection-volume").textContent = `Volumen de minerales pendiente: ${formatNumber(pendingVolume)} m³ · ${trips === 1 ? "1 viaje estimado" : `${trips} viajes estimados`}`;

    const activeProjects = state.projects.filter((project) => project.active);
    ids.progressList.innerHTML = activeProjects.map((project) => {
      const progress = window.EvePlanner.getProgress(project, allocations[project.id]);
      return `<div class="progress-item"><span class="progress-name">${escapeHtml(project.name)}</span><span class="progress-percent">${formatNumber(progress)}%</span><div class="progress-track"><span style="width:${progress}%"></span></div></div>`;
    }).join("");
    $("#empty-progress").hidden = activeProjects.length > 0;
  }

  function renderOres(requirements) {
    const suggestions = window.EvePlanner.recommendOres(
      requirements, state.collected, state.ores, state.settings.efficiency
    );
    ids.recommendation.innerHTML = suggestions.slice(0, 3).map((ore) => {
      const trips = Math.ceil(ore.volume / state.settings.holdCapacity);
      return `<article class="recommendation-card"><strong>${escapeHtml(ore.name)}${ore.system ? ` · ${escapeHtml(ore.system)}` : ""}</strong>
        <p>Prioridad: <span>${escapeHtml(ore.mineral)}</span> · Déficit ${formatNumber(ore.deficit)}</p>
        <p>${formatNumber(ore.batches)} lotes · ~${formatNumber(ore.volume)} m³ · ${trips} ${trips === 1 ? "viaje" : "viajes"}</p>
        <p>Rendimiento estimado: ${formatNumber(ore.estimatedOutput)} ${escapeHtml(ore.mineral)}</p></article>`;
    }).join("");
    $("#empty-ores").hidden = state.ores.length > 0;
    ids.oreList.innerHTML = state.ores.map((ore) =>
      `<div class="ore-chip"><span>${escapeHtml(ore.name)}${ore.system ? ` · ${escapeHtml(ore.system)}` : ""}</span><small>${formatNumber(ore.volume)} m³/lote</small><button type="button" data-id="${escapeHtml(ore.id)}" aria-label="Eliminar perfil de ${escapeHtml(ore.name)}">×</button></div>`
    ).join("");
    ids.oreList.querySelectorAll("button[data-id]").forEach((button) => {
      button.addEventListener("click", () => {
        state.ores = state.ores.filter((ore) => ore.id !== button.dataset.id);
        saveState();
        render();
        showNotice("Perfil de mena eliminado.");
      });
    });
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
    renderOres(requirements);
    $("#efficiency").value = state.settings.efficiency;
    $("#hold-capacity").value = state.settings.holdCapacity;
    $("#mineral-volume").value = state.settings.mineralVolume;
  }

  state = loadState();
  initializeForms();
  render();
})();
