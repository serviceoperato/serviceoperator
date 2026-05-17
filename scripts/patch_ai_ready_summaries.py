#!/usr/bin/env python3
"""Replace ## Summary sections in grouped AI-ready files (regeneration batch)."""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from tx_summary_utils import (  # noqa: E402
    LIMITED_CONTENT_MARKER,
    needs_summary_regeneration,
    word_count,
)

REPO = _SCRIPTS.parent
AI_READY = REPO / "content" / "ai-ready-transcriptions"
TRANSCRIPTIONS = REPO / "content" / "transcriptions"

SUMMARY_RE = re.compile(r"(## Summary\n)([\s\S]*?)(?=\n## )")

# Full detail summaries (150–220 words typical; up to 250 for long chats).
# Card previews are derived at index time via card_preview_of().
PATCHES: dict[str, str] = {
    "2026-05-17-conversation-chat-history-with-karn-37d2a3a4fa59.md": """Export WhatsApp con Karn salvato il 14 maggio 2026, arco 2023–2026. Il thread è una relazione personale on-off tra Jack e Karn a Pattaya: litigi su stile di vita, bugie e alcol, pause e riconciliazioni, con passaggi su terapia e attachment avoidant. Dal 2024–2026 il tono diventa più stabile (Teerak): logistica quotidiana al Myth bar, pickup, trasferimenti USDC/ETH con hash Etherscan, chiarimenti su salute (herpes vs candida, avvertimenti IST), anniversario di tre anni (maggio 2026) e compleanni amici. Non compaiono deliverable Service Opera; il valore è contesto personale e tracciabilità di supporto emotivo e pagamenti in chat. Per chi consulta l’admin serve ricordare che decisioni mediche o legali vanno verificate fuori dal thread. Prossimo passo operativo: nessuna azione pipeline automatica; usare l’export solo come riferimento storico se serve ricostruire date o importi citati in conversazione.""",
    "2026-05-17-conversation-christian-42d821331d94.md": """Registrazione familiare lunga tra genitori e il figlio Christian sul tema di circa 50.000 € promessi per investimento sulla casa in costruzione o cointestata. La madre teme che, in uno scenario di separazione futura, Christian resti senza tutela sulla quota; il padre ribadisce che gli immobili sono stati pensati anche per i figli, cita circa 57.000 € da estinguere verso banca e mutuo e rifiuta di cambiare direzione senza un accordo conmotione condiviso. Nel file compaiono anche tensioni con Silvana, comunicazione assertiva, eredità e comunione, senza accordo formale finale chiaro nell’estratto indicizzato. Il contenuto ha implicazioni patrimoniali e relazionali: serve chiarire cointestazione, erogazione effettiva e eventuale rinegoziazione mutuo prima di movimentare liquidità. Non è un verbale legale. Prossimi passi pratici: allineamento esplicito tra le parti su importi e clausole, verifica con banca e, se necessario, consulenza legale esterna al di fuori di questa trascrizione.""",
    "2026-05-17-conversation-memo_001-5c1e4449ab12.md": """Conversazione registrata per sperimentare l’elaborazione AI dei punti focali: parte domestica su tablet e WhatsApp, poi brainstorming su un possibile servizio in abbonamento con riassunti audio quotidiani di libri. L’interlocutore nota che il modello esiste già in inglese e italiano e propone di non replicarlo per concorrenza satura. L’attenzione si sposta verso contenuti molto lunghi — libri specialistici, congressi e dibattiti europei di ore — con sintesi vocali automatizzate, distinguendosi dai telegiornali brevi ma riconoscendo che ogni taglio introduce bias e che serve ancora un lettore umano per omissioni e sfumature. Il filo lega l’esperienza personale (poco tempo, ascolto passivo) a un posizionamento informativo diverso, con decisione esplicita di non procedere sul clone dei riassunti-libro. Per Service Opera resta esplorazione di nicchia, non impegno di prodotto. Implicazione: definire differenziazione rispetto ai riassunti-libro esistenti e quanto controllo editoriale serve su politica e congressi prima di un prototipo.""",
    "2026-05-17-conversation-memo_002-ea440a9f313e.md": """Prosegue il dialogo su dibattiti e congressi europei: senza contraddittorio resta un solo punto di vista, con confronto emergono domande incrociate. Si ipotizza un servizio che sintetizzi dibattiti lunghi con tesi destra/sinistra, sintesi e pro/contro, oltre al telegiornale. L’interlocutore segue soprattutto politica, legge testate anche di controparte per cogliere omissioni e vuole strumenti di giudizio (par condicio) su benefici e rischi, non solo la valutazione del comunicatore. Il tema vaccini e scelte sanitarie compare come esempio di bisogno di versione lunga e breve, con attenzione a non sostituire il giudizio del lettore ma a rendere visibili trade-off. Il valore per il progetto informativo è validare se esiste pubblico disposto a un approfondimento oltre il formato televisivo standard e quanto sono disposti a pagare rispetto a fonti gratuite. Prossimo passo: testare template editoriale con pro/contro verificabili e misurare gap rispetto a replay Rai/Mediaset e sintesi online già disponibili.""",
    "2026-05-17-conversation-memo_003-c890c918890b.md": """Si discute di trasmissioni con contraddittorio che lasciano poco spazio all’opposizione, con preferenza per conduttori considerati più schietti. Confronto tra frequenza settimanale e quotidiana e sul recupero tramite replay (Rai Play, Mediaset Play), con il vincolo del tempo per chi lavora molte ore e non riesce a seguire puntate intere. Si ipotizza un servizio a pagamento che riassuma posizioni di destra, sinistra, scienziati e politica su temi come i vaccini, citando esempi di sintesi online (Dagospia, Huffington Post in italiano). Il mercato parziale risulta già coperto da testate e sunto gratuiti; resta da chiarire fattibilità economica, frequenza ideale (giornaliera vs settimanale) e differenza percepita rispetto al telegiornale serale. Implicazione pratica: confrontare formati “short news” con approfondimento opzionale e verificare se il paywall a due righe più corpo abbonamento aggiunge valore rispetto ai replay. Nessuna decisione di prodotto nel memo; solo esplorazione di posizionamento.""",
    "2026-05-17-conversation-memo_004-8320a9a4414c.md": """Breve confronto sul modello a due righe più abbonamento per leggere il corpo della notizia, con ribadito che i giornali hanno tagli editoriali di destra, centro e sinistra. La registrazione alterna questo filo a conversazione domestica su lasagna e pasta al forno, quantità di sugo per più persone e tempi di preparazione. Segue discussione su esposizione solare dietro vetri: alcuni raggi UV vengono filtrati, altri no; vecchie creme solari bloccavano calore ma non tutti i raggi associati al rischio; accenni a vetri e creme più recenti. Il mix rende il file utile sia per ipotesi di prodotto informativo sia per contesto familiare. Implicazioni: per il servizio news serve riprendere il filo editoriale in sede dedicata; per la salute indoor le affermazioni su UV vanno verificate con fonti mediche. Nessun task operativo estratto oltre alla pianificazione del pasto citata in chat.""",
    "2026-05-17-conversation-memo_005-eac97257e652.md": """Dialogo familiare che alterna critica al modello scolastico di letture estive e riassunti (es. Promessi sposi) con confronto su esperienze passate e utilità dei compiti vacanza. Acceso dibattito etico sulla pubblicazione online di video con minori (esempio Silvano/sciroppo, canali famiglia su YouTube), con forte disaccordo tra i partecipanti su consenso, privacy e ruolo dei genitori. Poi conversazione da cucina su broccoli, ossidazione e uso di limone e sale nell’acqua di cottura. Chiusura su pressione bassa, restrizioni su sale e caffè, parere cardiologico che definisce la condizione non risolutiva, mani fredde e limiti allo sport, con richiesta implicita di maggior chiarezza medica. Il contenuto mescola policy familiare su immagini dei minori e gestione salute. Implicazioni: allineamento familiare su foto/video dei bambini; eventuale follow-up cardiologico per attività fisica e sintomi periferici. Non emergono decisioni formali su prodotti digitali o scuola.""",
    "2026-05-17-conversation-memo_006-4a7e2f8a8406.md": """Conversazione ironica e filosofica su età, figli, eredità, fine del mondo e ipotesi di colonizzazione di Marte, con citazione di Proxima Centauri b. Si parla di fisica quantistica, percezione del tempo, sogni, déjà vu, riferimenti a Inception e Einstein, mescolando battute e domande esistenziali senza conclusioni operative. Accenno a un regalo o libro dell’autore intitolato «nulla è come sembra», con ricerca su narcisismo patologico e scena di violenza coniugale descritta in scrittura, senza rivelare l’intreccio completo. Il tono è creativo e speculativo, non operativo per Service Opera. Valore principale: work in progress letterario e confronto tra rigore scientifico e narrativa fantastica, utile come diario di idee per chi scrive. Prossimi passi suggeriti nel dialogo: proseguire scrittura senza spoilerare l’intreccio e chiarire il target lettore per il regalo discussa. Nessun impegno commerciale, calendario o task estratti per altri progetti; eventuali riferimenti scientifici restano opinione tra interlocutori.""",
    "2026-05-17-conversation-seconda-86e8348fd2d4.md": """Conversazione familiare lunga tra genitori Fabio e Silvana e figli (Stefania e altri), aperta sull’erogazione dei soldi promessi senza condizioni né ulteriori aspettative reciproche. Si chiariscono passati litigi su Natale, videochiamate, battesimi e percezione di «ingerenze» sull’educazione di Christian, con richiesta di un clima non ostile. Le decisioni verbalizzate includono: erogare quando i fondi saranno disponibili come ultima distribuzione con riserva per la vecchiaia; nessun vincolo né aspettativa futura da entrambe le parti; possibile presenza a feste nel rispetto reciproco senza obbligo; non usare Christian né minacciare il taglio dei rapporti con il nipote; evitare pressione su Silvana quando sta male. Restano aperti dettagli su quali Natali, visioni diverse sull’educazione verso i nonni, questioni vaccinara/Piacenza e la necessità che Christian esprima il proprio punto di vista. Implicazione: documentare eventuali accordi scritti se si vogliono evitare fraintendimenti patrimoniali o relazionali futuri.""",
    "2026-05-17-conversation-voice_005-6921c6f5bc0a.md": """Sessione di registrazione e planning per il canale YouTube «Tanti Soldi», dedicato a crypto, personal finance e uso di ChatGPT. Si lavora su intro, hook iniziali, consigli su telecamera e gesti, e script generati con ChatGPT per spiegazioni (Algorand, layer 1/2, struttura video). Emergono preferenze su formato intro (clap, saluto, primi secondi critici per TikTok e YouTube) e limite dell’AI sulle previsioni di mercato affidabili. Si discute chi presenta (Marco, Leonardo o Fabio — da confermare nei take) e come bilanciare sigla breve vs solo hook. Task aperti: finalizzare intro, prove con microfono, bloccare registrazione quando pronti. Implicazione pratica: registrare due video al prossimo incontro (intro + episodio spiegato). Il file documenta processo creativo, non risultati pubblicati. Utile per chi coordina il canale come checklist di ripresa e messaggistica educativa, non come consulenza finanziaria o promessa di rendimento.""",
    "2026-05-17-conversation-whatsapp-chat-wi-6aabaa09ab24.md": """Gruppo WhatsApp «30-13» (maggio 2026) tra Koragon Gicos, Giovanni Castoldi, Vincenzo Cammarrata, Roger (+971) e Jack. Coordinamento quotidiano a Pattaya: colazione e caffè (Chao Doi, Cremerie), pizza da Giovanni, serate Soi 6, Myst, Flirt e Zama rooftop Jomtien, battute e foto. Roger commenta mercati (short BTC); Giovanni condivide video con studentessa MIT. Compare il fatto che la moglie di Jack lavori al bar con turni variabili, influenzando orari di uscita. La chat chiude intorno al 16 maggio con uscite notturne e riferimenti a ThaiFriendly. Non è un verbale di progetto: funge da diario sociale expat e logistica amici in vacanza. Implicazione per chi legge l’admin: utile per contesto vita Pattaya e rete italiani, senza task business centralizzati. Nessuna azione Service Opera derivata; eventuali riferimenti crypto sono informali tra pari.""",
    "2026-05-17-conversation-whatsapp-chat-with-iann-c52f33323d06.md": """Gruppo familiare WhatsApp «IANNACE» (Mamma, Papà, Frostan/Stefania, Jack, Christian) attivo dal 2015. Saluti quotidiani, logistica tra Piacenza e Residence Europa (caricabatterie, spedizioni Mail Boxes), foto di Kristen e nipoti, lavori casa (piazzale indicato intorno a 8.000 €, autobloccanti), notizie locali (commissariamento Anzio/Nettuno, battesimi). Tono prevalentemente affettivo e pratico; decisioni domestiche e spedizioni si discutono in chat senza tracker centralizzato. Compare spesso Silvana e Christian nei thread; eventi religiosi e auguri strutturano il calendario sociale della famiglia. Il gruppo funge da canale principale per aggiornamenti e foto, non da verbale di riunioni formali. Per Service Opera il file non contiene deliverable lavorativi. Valore: ricostruire timeline familiare, contatti e spese citate quando servono contesto personale. Prossimo passo: consultare solo per riferimento; importi o lavori vanno confermati con documenti esterni alla chat.""",
    "2026-05-17-conversation-whatsapp-chat-with-italiani-a-patta-9c47ef78ab53.md": """Gruppo WhatsApp «italiani a Patta» creato nel 2023, attivo 2024–2025 con Koragon Gicos, Giovanni Castoldi, Stefano Pattaya e Jack. Coordinamento uscite: Sand Sauna, Pizza Italy, ToyBox, Soi 5/6, Pin-Up; discussioni su crypto (Trump, short BTC, USDT/Nexo), requisiti visto DTV Thailandia (500k THB, nomadi digitali) e divieti ecig in Thailandia. Tono informale con battute e qualche rimozione membro; contenuti economici e normativi vanno letti come chiacchiere tra pari, non consulenza professionale. Utile come diario della rete italiani a Pattaya, non come verbale di riunione formale né archivio decisionale Service Opera. Implicazione: nessuna azione pipeline automatica; per decisioni su visti o investimenti serve verifica su fonti ufficiali. Stefano segue trading in chat; Koragon propone locali e serate — valore principale logistica sociale expat e condivisione esperienze sul posto.""",
    "2026-05-17-conversation-whatsapp-chat-with-koragon-gi-f97895de6fd3.md": """Chat 1:1 WhatsApp con Koragon Gicos (Gicos) dal 2021, prevalentemente da Pattaya. Argomenti ricorrenti: tamponi COVID in inglese, affitto scooter Morotino per due-tre mesi, mappe di locali e nightlife, contenuti OnlyFans e video (prezzi intorno a 1.500 THB, qualità, marketing), sauna (Sauna Bar, Sands), app budget senza export Excel, nickname «Birillo». Conversazioni leggere su incontri, cibo e TikTok; nessun progetto Service Opera strutturato. Koragon funge da contatto stabile per logistica quotidiana e uscite; compaiono discussioni economiche su piattaforme adulte e riferimenti ad ambulatorio o consolato per documenti COVID da verificare sul posto. Implicazione: archivio personale utile per contesto Thailandia e rete locale, non per task aziendali. Prossimo passo: consultare solo se serve ricostruire accordi storici su scooter o documenti; stato attuale e prezzi vanno confermati fuori chat.""",
    "2026-05-17-meeting-voice_260517_181446-85846b20bb26.md": """Nota vocale breve del 17 maggio 2026 sul progetto dating app Thai Fans: l’autore propone di impostare un meeting ricorrente ogni martedì tramite Google Meet con G-Cos e Giovanni per coordinare lo sviluppo. Non emergono orario, durata, chi invia l’invito né altre decisioni oltre all’intenzione di cadenzare incontri settimanali. L’obiettivo pratico è tradurre l’intento in una serie calendario condivisa con partecipanti confermati. Limited content available.""",
    "2026-05-17-voice-note-voice_001-c8091515a34f.md": """Clip audio del 9 dicembre 2022: Whisper rileva lingua «nn» (non italiana, probabile singalese) con probabilità alta ma testo non utilizzabile per task o decisioni in italiano. Nessun partecipante o progetto identificabile dall’estratto. Limited content available.""",
    "2026-05-17-voice-note-voice_002-f0dc2085112e.md": """Registrazione molto breve del 9 dicembre 2022 con audio di bassa qualità: il trascritto non consente di ricostruire argomenti, persone o azioni in modo affidabile. Da trattare come campione tecnico senza contenuto semantico utile per il sito. Limited content available.""",
    "2026-05-17-voice-note-voice_003-8ae8c30860dd.md": """Nota vocale breve del 9 dicembre 2022: il trascritto contiene solo frammenti e rumore, senza tema ricorrente né impegni verificabili. Non emergono nomi, date operative o deliverable. Limited content available.""",
    "2026-05-17-voice-note-voice_004-d58c88f66165.md": """Prova tecnica di registrazione: setup microfono, tracce e ripartenza per test suoni; confronto tra ripresa video e solo audio con preferenza per test audio senza video. Nessun progetto o decisione oltre alla sperimentazione di attrezzatura. Limited content available.""",
    "2026-05-17-voice-note-voice_006-4d392948d577.md": """Frammento audio breve senza argomento chiaro nel trascritto: possibile prova o conversazione di fondo non decifrabile in modo affidabile. Non estrarre task o decisioni da questo file senza revisione umana dell’audio originale. Limited content available.""",
    "2026-05-17-voice-note-voice_007-793016bc4f37.md": """Frammento conversazionale molto corto e rumoroso (domande su «cosa si ricorda», tono confuso). Non permette sintesi tematica né azioni follow-up affidabili. Limited content available.""",
    "2026-05-17-voice-note-voice_250621_185357-69216cdbadfb.md": """Clip quasi vuota sul trascritto automatico: durata brevissima senza contenuto lessicale utile. Probabile test microfono o registrazione accidentale. Limited content available.""",
    "2026-05-17-voice-note-voice_250621_185410-a4d50b0e6da1.md": """Registrazione brevissima senza testo significativo nel trascritto Whisper: nessun tema, persona o impegno identificabile. Limited content available.""",
    "2026-05-17-voice-note-voice_260516_191818-596e527d5382.md": """Nota del 16 maggio 2026 con trascritto troppo corto per ricostruire un argomento completo; possibile avvio registrazione senza dialogo utile. Limited content available.""",
    "2026-05-17-voice-note-voice_260516_235502-aa98439a4b47.md": """Frammento notturno del 16 maggio 2026: il trascritto non offre abbastanza contesto per summary analitico senza ascolto manuale. Trattare come pending review se l’audio originale risulta rilevante. Limited content available.""",
}


def raw_word_count(ai_ready_path: Path) -> int | None:
    text = ai_ready_path.read_text(encoding="utf-8")
    m = re.search(r"source_transcription:\s*content/transcriptions/([^\n]+)", text)
    if not m:
        return None
    raw = TRANSCRIPTIONS / m.group(1).strip()
    if not raw.is_file():
        return None
    body = raw.read_text(encoding="utf-8", errors="replace")
    tm = re.search(r"## Transcription\n([\s\S]*)", body)
    chunk = tm.group(1) if tm else body
    return word_count(chunk)


def replace_summary(md: str, new_summary: str) -> str:
    new_summary = new_summary.strip()
    if not SUMMARY_RE.search(md):
        raise ValueError("Missing ## Summary section")
    return SUMMARY_RE.sub(r"\1" + new_summary + "\n\n", md, count=1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Patch AI-ready Summary sections")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--only-needs", action="store_true", help="Skip files already >= 140 words")
    args = parser.parse_args()
    updated = 0
    skipped = 0
    for name, summary in sorted(PATCHES.items()):
        path = AI_READY / name
        if not path.is_file():
            print(f"MISSING {name}")
            continue
        md = path.read_text(encoding="utf-8")
        m = SUMMARY_RE.search(md)
        current = m.group(2).strip() if m else ""
        rwc = raw_word_count(path)
        if args.only_needs and not needs_summary_regeneration(current, raw_word_count=rwc or 0):
            skipped += 1
            continue
        if current.strip() == summary.strip():
            skipped += 1
            continue
        wc = word_count(summary)
        print(f"{'DRY ' if args.dry_run else ''}PATCH {name} ({wc} words)")
        if not args.dry_run:
            path.write_text(replace_summary(md, summary), encoding="utf-8")
        updated += 1
    print(f"Done: {updated} patched, {skipped} skipped")


if __name__ == "__main__":
    main()
