# R3V3NG3 CHROMA

Aplicación de realidad aumentada del proyecto **R3V3NG3 CHROMA**: calzado urbano experimental que cambia de color.

- **Inicio** (`index.html`): página de producto con la línea gráfica de la marca.
- **AR** (`ar.html`): apunta la cámara a `assets/marker/target.jpg`. Aparece la zapatilla 3D; se gira con el dedo, se escala con dos dedos, cambia de color (paleta de la marca) y tiene 3 diálogos: Colores, Materiales y Descripción.
- **Filtro** (`filtro.html`): máscara blanca con el logo R3V3NG3 sobre la cara (cámara frontal), con captura de foto.
- **Sonidos** generados con Web Audio (drone ambiental, golpes industriales, zumbido eléctrico al cambiar de color).

Tecnologías: three.js (r186), MindAR 1.2.5 (seguimiento de imagen y de cara). Sitio estático publicado en Vercel.

Tipografías: Archivo Black e Inconsolata (licencia OFL, en `assets/fonts`). Paleta: `#000000` `#FFFFFF` `#6B0606` `#DFD7C2`.
