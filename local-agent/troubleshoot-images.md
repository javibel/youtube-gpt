# Troubleshooting: Imagenes / Sharp

Consultar este archivo ANTES de depurar problemas de procesamiento de imagenes.

---

## Eliminar fondo blanco elimina partes blancas del producto
Un threshold simple convierte TODOS los pixeles blancos en transparentes, incluyendo LEDs, paneles de luz, filtros blancos del producto.
**Solucion:** Algoritmo en 3 pasos:
1. Flood-fill desde bordes -> eliminar fondo exterior conectado
2. Etiquetar regiones blancas interiores por tamano (connected components)
3. Regiones grandes (>5000px) = huecos del producto -> transparente. Regiones pequenas = parte del producto -> preservar blanco

## Centro hueco del producto rellenado de blanco
Flood-fill desde bordes no distingue huecos interiores (ej. centro de un anillo, interior de auriculares) de partes blancas del producto.
**Solucion:** Connected component labeling post flood-fill. Regiones blancas grandes encerradas dentro del producto = huecos -> transparente. Regiones pequenas = detalles del producto -> preservar.
