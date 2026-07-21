# Cómo volver a la versión estable original

Este archivo te explica cómo recuperar el proyecto si algo sale mal.
La versión segura está guardada con el nombre **version-estable-original**.

---

## Opción 1 — Volver atrás completamente (borra los cambios nuevos)

Abre la Terminal y pega estos comandos uno por uno:

```
cd /Users/marcosandre/nexa/nexa-app
```
```
git checkout version-estable-original
```

Eso te lleva exactamente al momento en que todo funcionaba.

---

## Opción 2 — Volver atrás pero sin perder los cambios nuevos

Si quieres recuperar la versión estable pero guardar una copia de lo nuevo:

```
cd /Users/marcosandre/nexa/nexa-app
```
```
git stash
```
```
git checkout version-estable-original
```

---

## Opción 3 — Ver qué versión tienes ahora

Para saber en qué versión estás parado:

```
cd /Users/marcosandre/nexa/nexa-app
```
```
git log --oneline -5
```

---

## Opción 4 — Volver a la versión más reciente después de haber ido atrás

Si fuiste atrás y quieres volver al presente:

```
cd /Users/marcosandre/nexa/nexa-app
```
```
git checkout main
```

---

## En resumen

| Quiero...                        | Comando                                    |
|----------------------------------|--------------------------------------------|
| Ir a la versión segura           | `git checkout version-estable-original`    |
| Volver al presente               | `git checkout main`                        |
| Ver dónde estoy                  | `git log --oneline -5`                     |

---

## Apps respaldadas

En la carpeta `respaldo-app-estudio/` de este proyecto están guardadas:
- `index.html` — App principal del estudio
- `vertice-performance_1.html` — App Vértice Performance
- `NEXA-v2.2-funcionando-19jul.html` — Versión anterior de NEXA

Esas apps también están en GitHub, así que nunca se pierden.
