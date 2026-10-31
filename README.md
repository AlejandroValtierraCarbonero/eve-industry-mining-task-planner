# EVE Industry & Mining Planner

MVP local para organizar proyectos industriales y el grupo de recolección de minerales. No requiere instalar dependencias ni ejecutar un servidor.

## Ejecutar

Abre `index.html` en un navegador moderno. Los datos se guardan en el almacenamiento local de ese navegador y dispositivo; no se envían a ningún servidor.

## Publicación en GitHub Pages

**Aplicación publicada:** https://alejandrovaltierracarbonero.github.io/eve-industry-mining-task-planner/

**Entorno de pruebas:** https://alejandrovaltierracarbonero.github.io/eve-industry-mining-task-planner/testing/

El workflow de GitHub Actions publica automáticamente la versión estable desde `main` y la versión de pruebas desde `testing`. Para probar cambios sin alterar producción, sube los cambios a la rama `testing`; al aprobarlos, intégralos en `main`. Cada publicación reconstruye las dos versiones. El entorno de pruebas tiene un aviso visible y almacenamiento local independiente. También puedes iniciar la publicación manualmente desde **Actions**.

## Funcionalidad disponible

- Crear proyectos con materiales manuales, prioridad y activación en el grupo de recolección.
- Agregar necesidades del grupo y calcular el progreso global e individual.
- Registrar minerales obtenidos, asignarlos por prioridad y mostrar excedentes.
- Definir perfiles de menas, rendimientos por lote, eficiencia de reprocesamiento, capacidad de carga y volumen por unidad de mineral.
- Obtener recomendaciones heurísticas para el mineral pendiente más crítico.

Los perfiles de rendimiento deben introducirse según la configuración real del personaje y la estructura. El volumen de minerales pendientes se estima con el volumen por unidad configurado en los ajustes; modifica ese valor si corresponde.

## Límites y siguientes fases

- El planificador actual recomienda la mena de menor volumen para el déficit más crítico. No resuelve todavía la optimización lineal de coproductos.
- No incluye catálogo SDE, buscador de blueprints ni inicio de sesión/lectura de inventario mediante ESI.
- La asignación de materiales recolectados se recalcula por prioridad entre los proyectos activos. Al desactivar proyectos, las cantidades registradas se conservan y pueden aparecer como excedentes.

## Pruebas

Con Node.js instalado, ejecuta `node --test planner.test.js`.
