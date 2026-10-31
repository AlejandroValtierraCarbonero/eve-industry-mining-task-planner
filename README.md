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
- Buscar 4.000+ productos fabricables del EVE Online SDE y cargar sus materiales base al proyecto.
- Configurar la eficiencia de materiales (ME) entre 0 y 10 % para cada blueprint; cada proyecto conserva su valor y recalcula sus requisitos de forma independiente.
- Agregar necesidades del grupo y calcular el progreso global e individual.
- Registrar materiales obtenidos, asignarlos por prioridad y mostrar excedentes.
- Filtrar el catálogo SDE de menas por seguridad y seleccionar solo aquellas que producen algún mineral requerido por los proyectos activos. Cada mena muestra su requisito individual y el seguimiento de unidades sin procesar minadas; los coproductos estimados de las menas registradas reducen las alternativas restantes. Los perfiles personalizados también se pueden clasificar por seguridad.
- Configurar la eficiencia de reprocesamiento, la capacidad de carga y el volumen para materiales manuales.

El catálogo de menas usa rendimientos y tamaños de lote del SDE. La clasificación de los cinturones de asteroides sigue la [distribución oficial de recursos de CCP](https://www.eveonline.com/news/view/resource-distribution-update); “media” es el intervalo de 0,5–0,7 dentro de high-sec, no una zona oficial independiente, por lo que comparte sus menas. Los depósitos de mena de soberanía nuevos se clasifican como null-sec siguiendo las [notas oficiales de Equinox](https://www.eveonline.com/news/view/equinox-expansion-notes); los depósitos especiales sin una clasificación fiable se muestran bajo “Sin clasificar”. Cada requisito de mena es una alternativa individual para su mineral deficitario más importante, no debe sumarse a las demás filas. Los lotes minados se contabilizan al completarse; sus coproductos estimados reducen los déficits de todas las alternativas seleccionadas. Al reprocesar la mena, registra los minerales reales en Recolección y finaliza el ciclo de mena para actualizar la base del siguiente plan, evitando contar dos veces el mismo material. Los perfiles manuales deben especificar las unidades de mena por lote. La ME se configura en el plano usado para cada proyecto y aplica una reducción a su coste total, con redondeo hacia arriba por material; no incluye bonificaciones de estructura, rigs ni excepciones específicas por material. Los proyectos guardados antes de esta configuración conservan el ME global que tenían como valor inicial individual. El volumen de materiales del SDE usa sus datos oficiales; los materiales introducidos manualmente usan el volumen por unidad configurado en los ajustes.

## Límites y siguientes fases

- El planificador presenta alternativas por mena y actualiza sus rendimientos estimados con las menas minadas registradas. No resuelve todavía la optimización lineal de coproductos ni la disponibilidad exacta por sistema, anomalía o luna.
- La búsqueda de blueprints y la planificación de menas basadas en el SDE están disponibles en producción y pruebas; no incluyen inicio de sesión ni lectura de inventario mediante ESI.
- La asignación de materiales recolectados se recalcula por prioridad entre los proyectos activos. Al desactivar proyectos, las cantidades registradas se conservan y pueden aparecer como excedentes.

## Pruebas

Con Node.js y Python instalados, ejecuta `node --test planner.test.js` y `python -m unittest discover -s scripts -p 'test_*.py'`.

El catálogo de blueprints y menas se genera desde el [SDE JSONL oficial](https://developers.eveonline.com/docs/services/static-data/) en cada publicación de Pages y cada jueves. Las menas comprimidas se excluyen porque no se extraen directamente. El archivo comprimido se almacena en la caché de GitHub Actions según el número de build del SDE.
