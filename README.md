# Atmosfera

Atmosfera è un dispositivo che non esiste ancora: una specie di macchina fotografica che, invece di catturare ciò che si vede, cattura **come si sta** in un momento. Luce, colore della luce, rumore, temperatura, umidità e CO₂ diventano un "francobollo" astratto su un display e-ink a colori Spectra 6.

Questa webapp è il banco di prova del **motore emotivo**, cioè l'algoritmo che disegna il francobollo, ed è già usabile come diario: la stessa logica verrà portata sull'ESP32-S3.

## Come si usa

L'app ha tre schede.

**Scatta**, in tre passi:
1. **Il momento.** *Solo sensori*: dati aperti di dove sei adesso. *Immagine + sensori*: dati del luogo e del momento di una foto.
2. **Come ti senti?** Una ghiera con dodici emozioni: destra piacevole, sinistra spiacevole, in alto energia, in basso quiete. Più ti allontani dal centro, più è forte. Se non trovi la parola, scrivila: un piccolo lessico propone l'emozione sulla ghiera, e le tue parole finiscono sul francobollo e nell'archivio.
3. **Il tuo francobollo.** Premi *Un'altra* finché non trovi quello che senti tuo, poi *È questa*. Sul telefono, mentre giri la ghiera, un'anteprima fissa in basso ti mostra il francobollo che cambia.

**Archivio**: tutti i momenti scelti, filtrabili per emozione. Ogni voce ha immagine, data, luogo, emozione sentita, parole, dati dell'ambiente e quale variante hai scelto. *Salva immagine* sul telefono apre il foglio di condivisione (da lì: Salva immagine, AirDrop, File…); sul computer scarica il PNG.

**Laboratorio**: il gusto imparato, le scene simulate, i pesi, i sensori e il vettore emotivo modificabili, l'atlante delle emozioni e l'esportazione per il display.

## Come impara il tuo gusto

Ogni francobollo nasce da un'emozione e da uno **stile**: 22 "geni" che piegano la grammatica senza cambiarne il senso.
- 10 preferenze per le tavolozze;
- 4 preferenze per le composizioni;
- 8 tratti: densità delle linee, grana, fondo pieno o leggero, accenti, grandezza del nucleo, turbolenza, propensione al buio, campiture a gradini.

Come funziona:
- **La proposta** è lo stile che il gusto attuale prevede per l'emozione di quel momento.
- **Un'altra** pesca una variante attorno a quella previsione. All'inizio le varianti sono molto diverse fra loro; più scelte fai, più si stringono attorno a ciò che ti somiglia.
- **È questa** sposta il gusto verso lo stile scelto e un po' lontano da quelli scartati.
- **Il gusto dipende dall'emozione.** Ogni scelta resta in memoria insieme all'emozione in cui l'hai fatta, quindi per la malinconia può imparare cose diverse che per la gioia.

Il Laboratorio mostra a che punto è: quante scelte, quanti tentativi ti servivano all'inizio e quanti ora, quali tavolozze e segni preferisci. *Ricomincia da zero* azzera tutto.

Con il gusto a zero il motore disegna esattamente come prima: gli scatti vecchi non cambiano.

## Il momento: dati aperti al posto dei sensori

Finché non c'è l'hardware, i **sensori sono dati aperti** ricavati da una posizione e da un istante.

| Modo | Luogo e momento | Da dove arrivano i valori |
|---|---|---|
| **Solo sensori** | Dove sei adesso (GPS del dispositivo) | Tutti dai dati aperti, più il microfono se vuoi misurare il rumore |
| **Immagine + sensori** | Dove e quando è stata scattata la foto (GPS ed EXIF; se mancano, dispositivo e data del file) | Luce e colore della luce dalla foto, il resto dai dati aperti di quel luogo e di quell'ora |

Se non rilevi nulla e scegli solo l'emozione sulla ghiera, il francobollo nasce comunque, con un ambiente neutro. Nel Laboratorio restano le **scene simulate**, che funzionano anche offline, e la **Taratura a mano** per impostare direttamente lo stato d'animo.

Quanto pesa ciò che senti rispetto ai dati si regola nel Laboratorio (predefinito 75 %). Ciò che senti decide la struttura del francobollo; l'ambiente tiene buona parte della luce e del colore.

### Fonti dei dati

| Sensore del dispositivo | Al suo posto, per ora | Fonte |
|---|---|---|
| Temperatura, umidità | Valore misurato o di archivio per quell'ora | [Open-Meteo](https://open-meteo.com/): previsioni, dati orari recenti, archivio storico oltre i 3 mesi |
| CO₂ | CO₂ atmosferica, più l'indice europeo della qualità dell'aria | Open-Meteo Air Quality (Copernicus CAMS) |
| Luce, colore della luce | Altezza del sole, nuvole e radiazione solare; in foto, l'esposizione EXIF | Calcolo locale + Open-Meteo |
| Rumore | Stima da strade, binari e locali nel raggio di 60–160 m e dall'ora del giorno, oppure 3 secondi di microfono | [OpenStreetMap](https://www.openstreetmap.org/) via Overpass |
| (luogo) | Nome del quartiere e della città per la didascalia | OpenStreetMap Nominatim |

Nessuna fonte richiede una chiave. Ogni valore mostra da dove viene e si può correggere a mano.

**Cosa esce dal dispositivo:** solo le coordinate (e la data, per le foto), inviate a Open-Meteo, Nominatim e Overpass. La foto e l'audio restano nel browser.

**Limiti onesti**
- Sono dati di **esterno**. In una stanza luce, temperatura e soprattutto CO₂ sono diversi: la CO₂ esterna resta quasi ferma attorno a 420–440 ppm, quindi per ora la tensione dipende poco da lei. La qualità dell'aria esterna (indice europeo) aggiunge un po' di tensione quando è scadente.
- Il rumore da OpenStreetMap è una stima di massima. Il microfono del telefono non è tarato: l'offset si cambia in `MIC_OFFSET_DB` in `public/js/app.js`.
- Nominatim chiede al massimo una richiesta al secondo e una fonte identificabile: l'app ne fa una per scatto e conserva i nomi già trovati.

### Cosa si legge da una foto
- **Luce (lux)**: dall'esposizione EXIF, con `EV100 = log2(N²/t) − log2(ISO/100)` e `lux ≈ 2,5 · 2^EV100`. Senza EXIF è una stima grezza, segnalata come tale.
- **Colore della luce (K)**: bilanciamento del bianco stimato, metà "mondo grigio" e metà pixel più chiari, poi formula di McCamy.
- **Luogo e ora**: GPS e `DateTimeOriginal` dall'EXIF.
- **Qualità visive**: luminosità, contrasto, saturazione, dettaglio. Il cursore "Quanto conta l'immagine" decide quanto spostano lo stato d'animo.
- **Seme**: un'impronta dei pixel, quindi la stessa foto dà sempre lo stesso francobollo.

Attenzione: molte app di messaggistica tolgono GPS ed EXIF. Per i test usa la foto originale dalla galleria o scattala dall'app.

## Come funziona il motore

```
sensori ─┐
         ├→ vettore emotivo → grammatica (+ stile imparato) → motori grafici → 6 inchiostri
ghiera  ─┘
```

1. **Vettore emotivo** (0–1): valenza, energia, tensione, intimità, chiave (luminosità), calore.
2. **Grammatica**: tavolozza (10 rampe di inchiostri), composizione (nucleo, costellazione, orizzonte, deriva) e parametri dei motori.
3. **Motori**: una piccola rete neurale CPPN per il fondo, un campo di flussi per le linee, un attrattore strano per il nucleo, fasce ondulate e accenti nel colore complementare.
4. **Inchiostri**: ogni pixel finisce su uno dei 6 colori Spectra con un retino che va da ordinato (calma) a granuloso (agitazione).

I dettagli sono in [`docs/motore-emotivo.md`](docs/motore-emotivo.md).

## Struttura

```
public/                    il sito (servito così com'è, senza build)
  index.html
  styles.css
  engine/atmosfera-engine.js   il motore: puro, gira nel browser e in Node
  js/photo.js                  lettura della foto: EXIF (anche GPS), luce, colore, qualità
  js/atmo.js                   dati aperti: meteo, aria, luogo, rumore, modello della luce
  js/feel.js                   la ghiera delle emozioni e il lessico delle parole
  js/taste.js                  varianti e apprendimento del gusto
  js/db.js                     archivio nel browser (IndexedDB)
  js/zip.js                    zip senza compressione, per esportare e importare
  js/app.js                    l'interfaccia
scripts/
  test.js                  test senza dipendenze
  sheet.js                 foglio di prova: 8 scene × 5 semi in un PNG
  fixtures/                due foto di prova
docs/
  motore-emotivo.md
```

## Provarla sul computer

Serve Node 18 o successivo.

```bash
npm run dev      # apre http://localhost:3000
npm test         # 23 test: motore, stile, gusto, ghiera, parole, foto, dati aperti, zip
npm run sheet    # crea out/foglio.png con 8 scene × 5 semi
```

Senza Node basta un qualsiasi server statico, per esempio `python3 -m http.server --directory public`. La posizione funziona solo su `https` o su `localhost`: aprendo il file col doppio clic restano disponibili solo le scene simulate.

## Pubblicarla

**GitHub**
```bash
git remote add origin https://github.com/<utente>/atmosfera-web.git
git push -u origin main
```

**Vercel**
1. Su vercel.com scegli *Add New → Project* e importa il repository.
2. Lascia *Framework Preset* su **Other**. Il file `vercel.json` dice già a Vercel di servire la cartella `public/` senza build.
3. *Deploy*. Ogni push su `main` aggiorna il sito; ogni altro branch ottiene un'anteprima.
4. Al primo "Rileva qui e ora" il telefono chiede il permesso per la posizione; al primo "Ascolta 3 secondi" quello per il microfono. `vercel.json` consente posizione, microfono e fotocamera solo a questo sito.

## Archivio ed esportazioni

L'archivio vive nel browser del dispositivo (IndexedDB), insieme al gusto imparato. Ogni voce conserva l'immagine esatta che hai scelto (PNG 240 × 240), quindi resta uguale anche se il motore cambierà in futuro. Al primo salvataggio l'app chiede al browser di non cancellarlo quando serve spazio. Gli scatti delle versioni precedenti vengono importati da soli.

- **Salva immagine**: il francobollo a 960 × 960 pixel, a pixel netti.
- **Esporta tutto (.zip)**: è il backup e il modo di portare l'archivio su un altro dispositivo. Contiene:

  | File | Contenuto |
  |---|---|
  | `immagini/` | tutti i francobolli, con data ed emozione nel nome |
  | `atmosfera.csv` | una riga per momento; si apre con Excel o Numbers (separatore `;`) |
  | `atmosfera.json` | tutti i dati, per reimportare |
  | `gusto.json` | ciò che l'app ha imparato |

- **Importa**: accetta lo zip così com'è (o un vecchio album in JSON). Unisce senza duplicare. Recupera anche il gusto, se quello nel file è più maturo.
- **Esporta per il display** (Laboratorio): il buffer grezzo a 4 bit per pixel (28.800 byte), due pixel per byte con il nibble alto per primo. I codici colore sono quelli dei driver Spectra 6 di Waveshare (nero 0, bianco 1, giallo 2, rosso 3, blu 5, verde 6). **Vanno verificati sul datasheet del pannello** prima di usarli sull'hardware.

Telefono e computer hanno archivi separati: per unirli, esporta da uno e importa nell'altro.

## Limiti noti

- La lettura delle emozioni dai sensori è tarata a occhio e va validata con persone vere.
- Il lessico delle parole è piccolo (circa 100 radici) e non capisce le frasi complesse: propone, non decide.
- Se cancelli i dati del sito dalle impostazioni del browser, l'archivio si perde: esporta lo zip ogni tanto.
- La luce stimata da una foto senza EXIF è poco affidabile, perché il telefono corregge l'esposizione da solo.
- Le foto HEIC dell'iPhone si aprono solo in Safari. Negli altri browser vanno esportate in JPEG.
- I colori sullo schermo sono più vivi di quelli dell'e-ink.

## Attribuzioni

Dati meteo e qualità dell'aria: Open-Meteo (CC BY 4.0) e Copernicus Atmosphere Monitoring Service. Luoghi e strade: © contributori di OpenStreetMap (ODbL). L'uso gratuito di Open-Meteo è per scopi non commerciali: per un prodotto in vendita servirà il loro piano commerciale o un'altra fonte.

## Licenza

MIT. Vedi [`LICENSE`](LICENSE).
