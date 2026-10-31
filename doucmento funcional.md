# Documento de Especificación Funcional (FSD)

**Proyecto:** EVE Industry & Mining Task Planner

**Objetivo:** Sistema web de planificación industrial y agregación de tareas de recolección de minerales en EVE Online.

## 1. Visión general del sistema

La herramienta permite a los jugadores gestionar múltiples proyectos industriales simultáneamente. Consolida la demanda total de minerales puros, calcula qué cantidad de menas (ores) se deben minar considerando su eficiencia de reprocesamiento, genera una lista agregada de tareas de minería y realiza un seguimiento dinámico del porcentaje de progreso global e individual por proyecto según lo que se haya recolectado.

## 2. Modelos de datos core

### 2.1. Entidades de base de datos

- **Mineral:** Minerales puros (ej. Tritanium, Mexallon).
- **Ore (mena):** Tipos de asteroides/bloques de minería (ej. Veldspar, Concentrated Veldspar, Spodumain).
- **Ore Composition (lote de reprocesamiento):**
  - Porción base de reprocesamiento (ej. 100 unidades de Veldspar).
  - Rendimiento base de minerales producidos por lote.
- **Blueprint / Proyecto:**
  - Nombre del proyecto (ej. 2x Drake, 10x Medium Shield Extender II).
  - Lista de materiales requeridos (mineral + cantidad total).
  - Prioridad y porcentaje de avance ($0\% - 100\%$).

## 3. Lógica y algoritmos principales

### 3.1. Agregación de requerimientos (grupo de proyectos)

Cuando el usuario activa 2 o más proyectos a la vez, el sistema suma los minerales requeridos:

$$
\text{Requerimiento Total del Mineral } m =
\sum_{p \in \text{Proyectos}} \text{Cantidad}(m, p)
$$

### 3.2. Motor de solución de minería (Ore Solver / Linear Optimizer)

Debido a que una mena otorga múltiples minerales, el sistema debe ofrecer dos modos de recomendación de minería:

- **Modo Cobertura Exacta (Optimizado):** Resuelve un problema de programación lineal para calcular la cantidad mínima de m3 de asteroides que se deben minar para cubrir el 100% de todos los minerales sin generar excedentes masivos.
- **Modo Mena Única / Prioritaria:** Para jugadores en zonas específicas (ej. High-Sec), sugiere las menas locales más eficientes para cubrir el mineral deficitario más crítico.

### 3.3. Cálculo de progreso parcial y asignación de recursos

Si el usuario recolecta y procesa solo una fracción del material objetivo:

**Progreso de proyecto individual:**

$$
\text{Progreso Proyecto } P =
\frac{
  \sum_{m} \min\left(\text{Asignado}(m, P), \text{Requerido}(m, P)\right)
}{
  \sum_{m} \text{Requerido}(m, P)
}
\times 100
$$

**Regla de asignación por defecto:** Los minerales parciales se asignan según la prioridad del proyecto o de forma proporcional a las necesidades de cada proyecto activo.

## 4. Arquitectura de módulos web

### Módulo A: Configuración industrial

Configuración de variables del personaje: eficiencia de refinado (%) basada en la estación/estructura (Upwell structure), implantes y habilidades (Reprocessing Skills).

### Módulo B: Gestor de proyectos

- Selector/buscador de ítems a fabricar o entrada manual de minerales requeridos.
- Modificador de cantidad (construir N unidades).
- Selector de agrupamiento: marcar proyectos activos en el "Grupo de Recolección Actual".

### Módulo C: Generador de plan de tareas de minería

Muestra la lista consolidada de minería:

- Volumen total a extraer expresado en m3 y en número de cargamentos (según la capacidad del Hold de la nave minera, ej. Orca/Rorqual/Barge).
- Lista detallada: "Mina X unidades de Mena A en Sistema Y para obtener la cantidad de Mineral B y C".

### Módulo D: Panel de control de recolección (Tracking & Progress Bar)

- Campo de entrada rápida de material obtenido (Logging).
- Barras de progreso visuales:
  - Barra global del grupo ($0\% \to 100\%$).
  - Barras individuales por proyecto ($0\% \to 100\%$).
- **Indicador de excedentes (Overflow):** Muestra los minerales sobrantes obtenidos que pueden guardarse para futuros proyectos.

## 5. Integración opcional con EVE Online (SDE / ESI API)

- **EVE Static Data Export (SDE):** Carga automática de la base de datos oficial de Blueprints, Ores y composiciones de reprocesado.
- **EVE ESI API (SSO Login):** Lectura automática del inventario de minerales o hangares del jugador para evitar la introducción manual de datos.