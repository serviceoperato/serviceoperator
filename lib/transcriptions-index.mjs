/**
 * Build admin index of AI-ready voice outputs under content/.
 */
import fs from 'fs';
import path from 'path';

const CONTENT = 'content';

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function listMdFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => path.join(dir, e.name));
}

function rel(p) {
  return p.replace(/\\/g, '/');
}

function parseMeta(text) {
  const meta = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*-\s+\*\*([^*]+):\*\*\s*(.+)\s*$/);
    if (m) meta[m[1].trim().toLowerCase()] = m[2].trim().replace(/^`|`$/g, '');
  }
  return meta;
}

function sectionsOf(block) {
  const sections = {};
  const parts = block.split(/\n(?=##\s+)/);
  for (const part of parts) {
    const m = part.match(/^##\s+([^\n]+)\n([\s\S]*)/);
    if (m) sections[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return sections;
}

function bulletsFrom(sectionText) {
  if (!sectionText) return [];
  return sectionText
    .split('\n')
    .map((l) => l.replace(/^\s*-\s+/, '').trim())
    .filter((l) => l && !/^\(none extracted/i.test(l));
}

function previewOf(text, max = 200) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function titleFromFile(fileName, fallback) {
  const base = fileName.replace(/\.md$/i, '').replace(/-/g, ' ');
  return fallback || base;
}

function indexMeetings(root) {
  const dir = path.join(root, CONTENT, 'meetings');
  const items = [];
  for (const abs of listMdFiles(dir)) {
    const text = readText(abs);
    const chunks = text.split(/\n---\s*\n/).filter((c) => /#\s*Meeting Summary/i.test(c));
    const fileRel = rel(path.relative(root, abs));
    chunks.forEach((chunk, i) => {
      const sections = sectionsOf(chunk);
      const sourceMeta = parseMeta(sections.source || chunk);
      const summary = sections.summary || '';
      items.push({
        id: `meetings:${fileRel}:${i}`,
        category: 'meetings',
        categoryLabel: 'Meeting Summaries',
        title: titleFromFile(path.basename(abs), 'Meeting Summary'),
        path: fileRel,
        sourceAudio: sourceMeta['source audio'] || sourceMeta['source file'] || '',
        sourceTranscription: (sourceMeta['source transcription'] || '').replace(/`/g, ''),
        processedDate: sourceMeta['processing datetime'] || '',
        project: sourceMeta.project || '',
        preview: previewOf(summary),
        summary,
        decisions: bulletsFrom(sections.decisions),
        tasks: bulletsFrom(sections.tasks),
        openPoints: bulletsFrom(sections['open points']),
        nextSteps: bulletsFrom(sections['next steps']),
        body: chunk.trim(),
      });
    });
  }
  return items;
}

function indexNotes(root) {
  const dir = path.join(root, CONTENT, 'notes');
  const items = [];
  for (const abs of listMdFiles(dir)) {
    const text = readText(abs);
    const chunks = text.split(/\n---\s*\n/).filter((c) => /#\s*Voice Note/i.test(c));
    const fileRel = rel(path.relative(root, abs));
    chunks.forEach((chunk, i) => {
      const sections = sectionsOf(chunk);
      const sourceMeta = parseMeta(sections.source || chunk);
      const summary = sections['clean summary'] || sections.summary || '';
      items.push({
        id: `notes:${fileRel}:${i}`,
        category: 'notes',
        categoryLabel: 'Personal Notes',
        title: titleFromFile(path.basename(abs), 'Voice Note'),
        path: fileRel,
        sourceAudio: sourceMeta['source audio'] || sourceMeta['source file'] || '',
        sourceTranscription: (sourceMeta['source transcription'] || '').replace(/`/g, ''),
        processedDate: sourceMeta['processing datetime'] || '',
        project: sourceMeta.project || '',
        preview: previewOf(summary),
        summary,
        importantPoints: bulletsFrom(sections['important points']),
        possibleActions: bulletsFrom(sections['possible actions']),
        body: chunk.trim(),
      });
    });
  }
  return items;
}

function indexTasks(root) {
  const file = path.join(root, CONTENT, 'tasks', 'todo.md');
  if (!fs.existsSync(file)) return [];
  const text = readText(file);
  const items = [];
  const fileRel = rel(path.relative(root, file));
  const parts = text.split(/\n(?=##\s+)/);
  for (const part of parts) {
    const hm = part.match(/^##\s+([^\n]+)/);
    if (!hm) continue;
    const dateHeader = hm[1].trim();
    const sourceMeta = parseMeta(part);
    const lines = part.split('\n');
    for (const line of lines) {
      const tm = line.match(/^\s*-\s+\[([ xX])\]\s+(.+)$/);
      if (!tm) continue;
      const taskText = tm[2].replace(/\s*\(from [^)]+\)\s*$/i, '').trim();
      items.push({
        id: `tasks:${fileRel}:${items.length}`,
        category: 'tasks',
        categoryLabel: 'Tasks',
        title: previewOf(taskText, 80),
        path: fileRel,
        sourceAudio: sourceMeta['source audio'] || '',
        sourceTranscription: (sourceMeta['source transcription'] || '').replace(/`/g, ''),
        processedDate: sourceMeta['processing datetime'] || dateHeader,
        project: sourceMeta.project || '',
        taskText,
        status: tm[1].toLowerCase() === 'x' ? 'done' : 'open',
        dueDate: sourceMeta['due date'] || 'date/time to confirm',
        priority: sourceMeta.priority || '',
        preview: taskText,
        body: line.trim(),
      });
    }
  }
  return items;
}

function indexCalendar(root) {
  const file = path.join(root, CONTENT, 'calendar', 'events.md');
  if (!fs.existsSync(file)) return [];
  const text = readText(file);
  const items = [];
  const fileRel = rel(path.relative(root, file));
  const parts = text.split(/\n(?=##\s+)/);
  for (const part of parts) {
    const hm = part.match(/^##\s+([^\n]+)/);
    if (!hm) continue;
    const dateHeader = hm[1].trim();
    const sourceMeta = parseMeta(part);
    const whenM = part.match(/\*\*When:\*\*\s*(.+)/i);
    const detailsM = part.match(/\*\*Details:\*\*\s*(.+)/i);
    const when = whenM ? whenM[1].trim() : 'date/time to confirm';
    const details = detailsM ? detailsM[1].trim() : previewOf(part, 120);
    items.push({
      id: `calendar:${fileRel}:${items.length}`,
      category: 'calendar',
      categoryLabel: 'Calendar Events',
      title: previewOf(details, 80),
      path: fileRel,
      sourceAudio: sourceMeta['source audio'] || '',
      sourceTranscription: (sourceMeta['source transcription'] || '').replace(/`/g, ''),
      processedDate: dateHeader,
      eventDate: when.includes('confirm') ? 'date/time to confirm' : when,
      eventTime: sourceMeta.time || (/\d{1,2}:\d{2}/.test(when) ? when : 'date/time to confirm'),
      confidence: sourceMeta.confidence || '',
      notes: details,
      preview: details,
      body: part.trim(),
    });
  }
  return items;
}

function indexProjects(root) {
  const dir = path.join(root, CONTENT, 'projects');
  if (!fs.existsSync(dir)) return [];
  const items = [];
  for (const abs of listMdFiles(dir)) {
    const slug = path.basename(abs, '.md');
    const text = readText(abs);
    const fileRel = rel(path.relative(root, abs));
    const parts = text.split(/\n(?=##\s+)/);
    for (const part of parts) {
      const hm = part.match(/^##\s+([^\n]+)/);
      if (!hm) continue;
      const sourceMeta = parseMeta(part);
      const summary = part.replace(/^##[^\n]+\n/, '').trim();
      items.push({
        id: `projects:${slug}:${items.length}`,
        category: 'projects',
        categoryLabel: 'Project Updates',
        title: hm[1].trim(),
        path: fileRel,
        project: slug,
        sourceAudio: sourceMeta['source audio'] || '',
        sourceTranscription: (sourceMeta['source transcription'] || '').replace(/`/g, ''),
        processedDate: hm[1].trim().slice(0, 10) || sourceMeta['processing datetime'] || '',
        preview: previewOf(summary),
        summary,
        body: part.trim(),
      });
    }
  }
  return items;
}

function indexDecisions(root, meetingsFromIndex) {
  const dir = path.join(root, CONTENT, 'decisions');
  const items = [];
  const meetings = meetingsFromIndex || indexMeetings(root);
  if (fs.existsSync(dir)) {
    for (const abs of listMdFiles(dir)) {
      const text = readText(abs);
      const fileRel = rel(path.relative(root, abs));
      const sections = sectionsOf(text);
      const sourceMeta = parseMeta(sections.source || text);
      const decisionText =
        sections.decision || sections['decision text'] || bulletsFrom(text)[0] || previewOf(text, 120);
      items.push({
        id: `decisions:${fileRel}:0`,
        category: 'decisions',
        categoryLabel: 'Decision Log',
        title: previewOf(decisionText, 80),
        path: fileRel,
        decisionText,
        sourceAudio: sourceMeta['source audio'] || '',
        sourceTranscription: (sourceMeta['source transcription'] || '').replace(/`/g, ''),
        processedDate: sourceMeta.date || sourceMeta['processing datetime'] || '',
        project: sourceMeta.project || sourceMeta['related project'] || '',
        status: sourceMeta.status || '',
        context: sections.context || sections.reason || '',
        preview: previewOf(decisionText),
        body: text.trim(),
      });
    }
  }
  for (const m of meetings) {
    for (const d of m.decisions || []) {
      if (!d || /none extracted/i.test(d)) continue;
      items.push({
        id: `decisions:from-meeting:${m.id}:${items.length}`,
        category: 'decisions',
        categoryLabel: 'Decision Log',
        title: previewOf(d, 80),
        path: m.path,
        decisionText: d,
        sourceAudio: m.sourceAudio,
        sourceTranscription: m.sourceTranscription,
        processedDate: m.processedDate,
        project: m.project,
        status: '',
        context: m.summary,
        preview: d,
        body: d,
      });
    }
  }
  return items;
}

function indexOpenPoints(root, meetingsFromIndex) {
  const dir = path.join(root, CONTENT, 'open-points');
  const items = [];
  const meetings = meetingsFromIndex || indexMeetings(root);
  if (fs.existsSync(dir)) {
    for (const abs of listMdFiles(dir)) {
      const text = readText(abs);
      const fileRel = rel(path.relative(root, abs));
      const sections = sectionsOf(text);
      const sourceMeta = parseMeta(sections.source || text);
      const issue =
        sections['open issue'] ||
        sections.question ||
        bulletsFrom(text)[0] ||
        previewOf(text, 120);
      items.push({
        id: `open-points:${fileRel}:0`,
        category: 'open-points',
        categoryLabel: 'Open Points / Questions',
        title: previewOf(issue, 80),
        path: fileRel,
        issue,
        sourceAudio: sourceMeta['source audio'] || '',
        sourceTranscription: (sourceMeta['source transcription'] || '').replace(/`/g, ''),
        processedDate: sourceMeta.date || sourceMeta['processing datetime'] || '',
        project: sourceMeta.project || sourceMeta['related project'] || '',
        owner: sourceMeta.owner || 'owner to confirm',
        status: sourceMeta.status || 'open',
        preview: previewOf(issue),
        body: text.trim(),
      });
    }
  }
  for (const m of meetings) {
    for (const o of m.openPoints || []) {
      if (!o || /none extracted/i.test(o)) continue;
      items.push({
        id: `open-points:from-meeting:${m.id}:${items.length}`,
        category: 'open-points',
        categoryLabel: 'Open Points / Questions',
        title: previewOf(o, 80),
        path: m.path,
        issue: o,
        sourceAudio: m.sourceAudio,
        sourceTranscription: m.sourceTranscription,
        processedDate: m.processedDate,
        project: m.project,
        owner: 'owner to confirm',
        status: 'open',
        preview: o,
        body: o,
      });
    }
  }
  return items;
}

function countRawTranscriptions(root) {
  const dir = path.join(root, CONTENT, 'transcriptions');
  if (!fs.existsSync(dir)) return 0;
  return listMdFiles(dir).length;
}

export function buildTranscriptionsIndex(rootDir) {
  const root = path.resolve(rootDir);
  const meetings = indexMeetings(root);
  const notes = indexNotes(root);
  const tasks = indexTasks(root);
  const calendar = indexCalendar(root);
  const projects = indexProjects(root);
  const decisions = indexDecisions(root, meetings);
  const openPoints = indexOpenPoints(root, meetings);
  const all = [...meetings, ...notes, ...tasks, ...calendar, ...projects, ...decisions, ...openPoints];
  const rawCount = countRawTranscriptions(root);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    rawTranscriptionCount: rawCount,
    counts: {
      meetings: meetings.length,
      notes: notes.length,
      tasks: tasks.length,
      calendar: calendar.length,
      projects: projects.length,
      decisions: decisions.length,
      openPoints: openPoints.length,
      total: all.length,
    },
    items: all,
  };
}

export function writeTranscriptionsIndexFile(rootDir) {
  const out = path.join(rootDir, CONTENT, 'processed', 'transcriptions_index.json');
  const data = buildTranscriptionsIndex(rootDir);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return out;
}
