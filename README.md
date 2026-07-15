# Fredrikstad Ginfestival 2026 – festivalguide

En enkel, mobiltilpasset festivalguide bygget med HTML, CSS og JavaScript. Produktdata lastes fra `data/festival-data-v0.2.json`. Favoritter, hvilke produkter som er smakt og terningkast lagres lokalt i nettleseren.

## Kjør lokalt

Appen må serveres via en lokal webserver fordi den laster JSON med `fetch`.

```powershell
python -m http.server 8000
```

Åpne deretter `http://localhost:8000`.

## Publisering

Prosjektet kan publiseres direkte med GitHub Pages fra rotmappen på standardgrenen.
