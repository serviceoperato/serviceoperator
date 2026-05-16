# Bot Telegram → Cursor AI (SDK locale)

Invii messaggi su Telegram; il bot li inoltra a un **agente Cursor** sul tuo PC (`@cursor/sdk`, runtime **locale** sul path `CURSOR_LOCAL_CWD`).

## Requisiti

- Node 20+
- Chiave **Cursor** (`CURSOR_API_KEY`)
- Token bot **Telegram** (`TELEGRAM_BOT_TOKEN`)
- Lista **ALLOWED_TELEGRAM_IDS** (solo i tuoi ID, altrimenti chiunque potrebbe eseguire prompt sul repo)

## Setup

```bash
cd telegram-cursor-bot
cp .env.example .env
# compila .env con token, API key, cwd assoluto del repo, i tuoi Telegram user id
npm install
npm start
```

Il tuo user id Telegram: scrivi a [@userinfobot](https://t.me/userinfobot) o guarda i log del bot al primo messaggio (se temporaneamente commenti il check — **non** in produzione).

## Comandi Telegram

- `/start` — aiuto
- `/new` — nuova sessione agente (dimentica il contesto della chat precedente)

Tutto il resto è trattato come **prompt** per Cursor (stesso flusso multi-turn della chat in IDE, ma via SDK).

## Modello (Composer 2 lento vs veloce)

Il SDK usa `model.params` per il ragionamento. Per **Composer 2 più “lento” / approfondito** (più *thinking*):

```env
CURSOR_MODEL_ID=composer-2
CURSOR_MODEL_THINKING=high
```

Per risposte più rapide prova `low`. Valori ammessi: `high`, `medium`, `low`. Se `CURSOR_MODEL_THINKING` è vuoto, non si passa il parametro (default lato Cursor). Per altri modelli usa [`Cursor.models.list()`](https://cursor.com/docs/api/sdk/typescript) e allinea `id` / `params`.

## Limiti

- L’agente gira **sul processo del bot**, non dentro l’IDE Cursor aperta: modifica i file in `CURSOR_LOCAL_CWD` come farebbe un agent da CLI.
- Non è integrato con la UI di Cursor (Composer inline, ecc.); è un bridge **API**.
- Messaggi Telegram max ~4096 caratteri: risposte lunghe vengono spezzate in più messaggi.

## Sicurezza

Non committare `.env`. In produzione limita `ALLOWED_TELEGRAM_IDS` a un solo account e tieni il bot su una macchina fidata.
