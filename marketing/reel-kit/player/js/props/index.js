// Prop registry: reel.json refers to props by these keys ("prop": { "type": "stat-card", ... }).
// To add one, create a module next to this file (see _util.js for the contract) and list it here.

import checklist from "./checklist.js";
import docStamp from "./doc-stamp.js";
import formulaCard from "./formula-card.js";
import gavel from "./gavel.js";
import note from "./note.js";
import pair from "./pair.js";
import ratioPeople from "./ratio-people.js";
import shareSheet from "./share-sheet.js";
import signDoc from "./sign-doc.js";
import statCard from "./stat-card.js";
import timer from "./timer.js";

export const PROPS = {
  checklist,
  "doc-stamp": docStamp,
  "formula-card": formulaCard,
  gavel,
  note,
  pair,
  "ratio-people": ratioPeople,
  "share-sheet": shareSheet,
  "sign-doc": signDoc,
  "stat-card": statCard,
  timer,
};
