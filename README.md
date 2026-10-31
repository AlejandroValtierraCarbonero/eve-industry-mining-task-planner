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
- En el entorno de pruebas, buscar 4.000+ productos fabricables del EVE Online SDE y cargar sus materiales base al proyecto.
- Configurar la eficiencia de materiales (ME) entre 0 y 10 % para cada blueprint; cada proyecto conserva su valor y recalcula sus requisitos de forma independiente.
- Agregar necesidades del grupo y calcular el progreso global e individual.
- Registrar materiales obtenidos, asignarlos por prioridad y mostrar excedentes.
- En el entorno de pruebas, recomendar menas con los volúmenes por lote y las composiciones de reprocesamiento del SDE oficial, ajustados por la eficiencia configurada. Los perfiles personalizados pueden añadirse como complemento.
- Configurar la eficiencia de reprocesamiento, la capacidad de carga y el volumen para materiales manuales.

Las recomendaciones de menas parten de los rendimientos base y los volúmenes por lote del SDE; la eficiencia de reprocesamiento configurada ajusta el rendimiento estimado. Son una heurística para el mineral pendiente más crítico y no consideran disponibilidad por sistema o región. La ME se configura en el plano usado para cada proyecto y aplica una reducción a su coste total, con redondeo hacia arriba por material; no incluye bonificaciones de estructura, rigs ni excepciones específicas por material. Los proyectos guardados antes de esta configuración conservan el ME global que tenían como valor inicial individual. El volumen de materiales del SDE usa sus datos oficiales; los materiales introducidos manualmente usan el volumen por unidad configurado en los ajustes.

## Límites y siguientes fases

- El planificador actual recomienda la mena de menor volumen para el déficit más crítico. No resuelve todavía la optimización lineal de coproductos.
- La búsqueda de blueprints y las recomendaciones de menas basadas en el SDE están disponibles solo en el entorno de pruebas; no incluyen inicio de sesión ni lectura de inventario mediante ESI.
- La asignación de materiales recolectados se recalcula por prioridad entre los proyectos activos. Al desactivar proyectos, las cantidades registradas se conservan y pueden aparecer como excedentes.

## Pruebas

Con Node.js y Python instalados, ejecuta `node --test planner.test.js` y `python -m unittest discover -s scripts -p 'test_*.py'`.

El catálogo de blueprints y menas se genera desde el [SDE JSONL oficial](https://developers.eveonline.com/docs/services/static-data/) en cada publicación de Pages y cada jueves. Las menas comprimidas se excluyen porque no se extraen directamente. El archivo comprimido se almacena en la caché de GitHub Actions según el número de build del SDE.
