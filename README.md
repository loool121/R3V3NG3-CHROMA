# R3V3NG3 CHROMA

Aplicación de realidad aumentada del proyecto **R3V3NG3 CHROMA**: calzado urbano experimental que cambia de color.

- **Inicio** (`index.html`): página de producto con la línea gráfica de la marca.
- **AR** (`ar.html`): apunta la cámara a `assets/marker/target.jpg`. Aparece la zapatilla 3D; se gira con el dedo, se escala con dos dedos, cambia de color (paleta de la marca) y tiene 3 diálogos: Colores, Materiales y Descripción.
- **Filtro** (`filtro.html`): máscara R3V3NG3 sobre la cara (cámara frontal).
  - *Color change*: la máscara cambia entre los 4 colores de la paleta con un barrido de luz (igual que la zapatilla).
  - Gestos: **abrir la boca** = rugido, temblor y ráfaga de logos; **cerrar los ojos 1 s** = ojos de sangre y latido; **girar la cabeza** = siguiente color.
  - La zapatilla CHROMA orbita alrededor de la cabeza (toma el color de la máscara).
  - Ceniza y brasas, modo **Archivo** (blanco y negro con grano y viñeta), glitch.
  - **Foto** y **video** (hasta 15 s, con sonido) con el marco del archivo, para guardar o compartir.
- **Sonidos** generados con Web Audio: drone ambiental, golpes industriales, zumbido eléctrico al cambiar de color, rugido distorsionado, latido, barrido de aire al girar, zumbido de la zapatilla en órbita, crujido de cinta en modo archivo, obturador y pitidos de grabación.

Tecnologías: three.js (r186), MindAR 1.2.5 (seguimiento de imagen y de cara). Sitio estático publicado en Vercel.

Tipografías: Archivo Black e Inconsolata (licencia OFL, en `assets/fonts`). Paleta: `#000000` `#FFFFFF` `#6B0606` `#DFD7C2`.
