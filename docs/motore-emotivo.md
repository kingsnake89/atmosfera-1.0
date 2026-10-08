# Motore emotivo — v0.3

Display di riferimento: Spectra 6 da 1,54", 240 × 240 pixel, 6 inchiostri (bianco, nero, rosso, giallo, blu, verde).

## 1. Sensori → vettore emotivo

Normalizzazioni (0–1):

| Simbolo | Da | Formula |
|---|---|---|
| L | luce | log10(lux) / 4,6 |
| k | colore della luce | (K − 2200) / 4600 · 0 calda, 1 fredda |
| n | rumore | (dB − 25) / 65 |
| tc | comfort termico | 1 fuori dalla fascia 19–25 °C scende di 0,1 per grado |
| hc | comfort igrometrico | 1 − abs(UR − 47) / 38 |
| c | aria viziata | (CO₂ − 450) / 1600 |

Emozioni:

- **Valenza** = 0,20·(1−k) + 0,16·tc + 0,08·hc + 0,30·(1 − smooth(0,1, 0,8, c)) + 0,10·campana(L, 0,65) + 0,16·(1 − smooth(0,5, 0,95, n))
- **Energia** = 0,58·n + 0,30·L + 0,12·calore dell'aria
- **Tensione** = 0,48·c + 0,22·(1−tc) + 0,20·smooth(0,5, 0,9, n) + 0,10·k·L
- **Intimità** = 0,36·(1−L) + 0,24·(1−k) + 0,26·campana(n, 0,25) + 0,14·smooth(0,05, 0,35, c)
- **Chiave** = 0,72·L + 0,28·valenza
- **Calore** = 0,75·(1−k) + 0,25·temperatura

Qualità dell'aria esterna (indice europeo, se disponibile): aq = smooth(30, 100, AQI); valenza −0,12·aq, tensione +0,18·aq.

Nome dello stato d'animo: griglia 3×3 valenza × energia (malinconia, disagio, inquietudine; sospensione, attesa, fermento; quiete, allegria, esultanza) più un aggettivo (raccolta, tesa, notturna, luminosa).

## 2. Dati aperti al posto dei sensori

- **Luce**: elevazione del sole (formula astronomica semplificata). Di giorno lux ≈ 115 × radiazione globale (W/m²); al crepuscolo log10(lux) ≈ 2,6 + 0,35 × elevazione; di notte 2 lux.
- **Colore della luce**: da 2400 K (sole all'orizzonte) a 5800 K (sole alto), verso 6500 K con cielo coperto; 3000 K di notte (luci artificiali).
- **Rumore**: 34 dB + strade principali (fino a +22) + secondarie (+9) + locali (+4) + binari (+8) + ristoranti e bar (+10); −9 di notte, +3 nelle ore di punta.
- **Temperatura, umidità**: Open-Meteo, valore corrente o orario. **CO₂ e AQI**: Open-Meteo Air Quality (CAMS).

## 3. Da foto

- Luogo e ora: GPS e DateTimeOriginal dall'EXIF; se mancano, posizione del dispositivo e data del file.
- Luce: EXIF → EV100 → lux. Senza EXIF: stima dalla luminosità media (grezza).
- Colore della luce: McCamy sulla media di "mondo grigio" e "pixel chiari".
- Le qualità visive spostano le emozioni con un peso regolabile (predefinito 35 %):
  - valenza ← saturazione e luminosità
  - energia ← dettaglio e saturazione
  - tensione ← contrasto e dettaglio poco colorato
  - intimità ← buio e poco dettaglio
  - chiave ← luminosità

## 4. Grammatica

- **Tavolozza**: 10 rampe con una "casa" nello spazio (valenza, energia, calore): Sole, Lume, Prato, Lago, Mezzodì, Brace, Temporale, Ghiaccio, Notte, Cenere. Con chiave < 0,30 la rampa si capovolge: fondo scuro e segni luminosi.
- **Composizione**: nucleo (intimità), costellazione (energia e poca intimità), orizzonte (calma e piacevole), deriva (tensione ed energia).
- **Fondo**: CPPN 5 → 8 → 8 → 2. Le funzioni d'attivazione dipendono dalle emozioni (sin per l'energia, gauss per la valenza, triangolare per la tensione). Con tensione > 0,55 il fondo va a gradini.
- **Linee**: flow field. L'energia aumenta numero e turbolenza. La tensione le fa puntare al nucleo; la calma le fa girare attorno.
- **Nucleo**: attrattore Clifford o de Jong accumulato in densità. La tensione stringe i nodi e aumenta il contrasto.
- **Accenti**: forme nel colore complementare (dischi, anelli, lune, schegge, trattini). L'intimità le avvicina al nucleo.
- **Retino**: Bayer 8×8 mescolato a rumore in base all'energia.

## 5. Costi sul dispositivo (stime)

- Buffer di tono 240×240 in uint8: 57,6 KB. Maschera accenti: 57,6 KB. Uscita a 4 bit: 28,8 KB. Sta in PSRAM con ampio margine.
- Circa 35 ms nel browser su un portatile; sull'ESP32-S3 stimati 1–3 s, da misurare.
