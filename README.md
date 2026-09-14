# lil'bakery Kassa

Kassa för försäljning av bakverk och dryck på popup. Fungerar på iPad, Android
och dator, i webbläsaren eller installerad som app på hemskärmen. Betalning med
Swish och kontanter. All data sparas lokalt på enheten.

## Filer

```
kassa/
  index.html              Hela appen (gränssnitt och logik)
  manifest.webmanifest    Gör att appen kan installeras på hemskärmen
  sw.js                   Service worker: appen fungerar utan internet
  icons/                  Appikoner
  img/                    Logga, muffins och ordmärke
  vendor/jszip.min.js     Läser Word-filer (.docx) vid produktimport
  vendor/qrcode.min.js    Skapar Swish-QR-koden
  Produktlista-mall.docx  Word-mall för produktimport
  serve.bat               Startar kassan på datorn för test i det lokala nätverket
```

## Så kommer du igång

1. **Testa på datorn.** Dubbelklicka på `serve.bat` (kräver att `.venv` finns i
   projektmappen, annars Python på datorn). Kassan öppnas på
   <http://localhost:8765/>. Adressen som visas i fönstret går att öppna på
   iPad och telefon i samma wifi.

2. **Publicera på en riktig adress** (rekommenderat för daglig användning).
   Enklast är GitHub Pages, som är gratis och ger https, vilket krävs för att
   appen ska fungera offline och kunna installeras på hemskärmen:
   - Skapa ett konto på <https://github.com> om du inte har ett.
   - Skapa ett nytt repository, till exempel `lilbakery-kassa`.
   - Ladda upp innehållet i mappen `kassa/` (alla filer och undermappar).
   - Gå till *Settings → Pages*, välj *Deploy from a branch*, gren `main`,
     mapp `/ (root)`, och spara.
   - Efter någon minut finns kassan på
     `https://<ditt-användarnamn>.github.io/lilbakery-kassa/`.

3. **Installera på enheterna.**
   - iPad och iPhone: öppna adressen i Safari, tryck på Dela och välj
     *Lägg till på hemskärmen*.
   - Android: öppna i Chrome, tryck på menyn (tre prickar) och välj
     *Installera app*.
   - Dator: klicka på installationsikonen i adressfältet i Chrome eller Edge.

4. **Lägg in dina uppgifter** under *Inställningar*: företagsnamn,
   organisationsnummer, Swish-nummer och växelkassa.

5. **Importera produkterna** under *Produkter → Importera från fil*. Utgå gärna
   från `Produktlista-mall.docx`.

## Kategoribilder

Varje kategori kan ha en bild som visas på produktplattorna och i
kategoriknapparna i kassan. Under *Produkter → Ändra* på kategorin väljer du
antingen en av de inbyggda tecknade bilderna i loggans stil (cookie, cupcake,
brownie, tårta, bulle, kaffe, kall dryck med flera) eller *Egen bild* för att
ta ett foto eller välja ur bildbiblioteket. Foton sparas i liten storlek i
appen. Nya kategorier får automatiskt en passande bild utifrån namnet.

## Produktimport från Word

Kassan läser en `.docx`-fil på två sätt:

- **Tabell** med kolumnerna *Kategori*, *Produkt*, *Pris* och valfritt *Moms*.
  Rubrikraden ska vara kvar. Tom kategori-cell betyder samma kategori som raden
  ovanför.
- **Lista** utan tabell: en rad med kategorinamnet, sedan en rad per produkt
  med priset sist på raden, till exempel `Chocolate chip 35`.

CSV-filer och vanliga textfiler fungerar på samma sätt, och listan kan även
klistras in direkt i importrutan.

## Data och säkerhetskopior

Kvitton, dagsavslut, produkter och inställningar ligger i webbläsarens lagring
på den enhet som används. Ingenting skickas någon annanstans. Därför:

- Ta en **säkerhetskopia** (Inställningar → Spara säkerhetskopia) efter varje
  försäljningsdag och spara filen på datorn eller i molnet.
- Använd **Dagsavslut → Export** för CSV-filer till bokföringen.
- Installera appen på hemskärmen på iPad. Då rensar inte Safari lagringen
  efter en tids inaktivitet, vilket kan hända för vanliga webbsidor.

## Ny version

När filerna i mappen ändras: ändra `VERSION` i `sw.js` så att installerade
appar hämtar den nya versionen. Appen visar då en knapp för att ladda om.
