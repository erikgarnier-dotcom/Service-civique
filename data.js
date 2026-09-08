/* Couche de stockage local pour le suivi des services civiques.
 * Les données sont persistées dans le localStorage du navigateur.
 * Trois entités : volontaires, missions, pointsSuivi, documents, structures.
 * Les enums d'étiquettes sont aussi définies ici pour l'affichage. */

// Nombre de jours de congé autorisés par mois pour un volontaire en service civique
const CONGES_ENTITLEMENT_PER_MONTH = 2

const DB_KEY = 'sciv_data_v1'

// Stockage sécurisé : si localStorage est indisponible (mode fichier local,
// navigation privée), on bascule sur un stockage en mémoire pour que
// l'application fonctionne dans tous les cas.
const store = (function () {
  let memory = null
  let useMemory = false
  try {
    const t = '__sciv_test__'
    localStorage.setItem(t, t)
    localStorage.removeItem(t)
  } catch (e) {
    useMemory = true
  }
  return {
    get(k) {
      if (useMemory) return memory ? memory[k] : null
      try { return localStorage.getItem(k) } catch (e) { return memory ? memory[k] : null }
    },
    set(k, v) {
      if (useMemory) { memory = memory || {}; memory[k] = v; return }
      try { localStorage.setItem(k, v) } catch (e) { memory = memory || {}; memory[k] = v }
    }
  }
})()

// ---------------------------------------------------------------------
// Libellés (FR) pour les enums utilisés dans l'application
// ---------------------------------------------------------------------
const LABELS = {
  volontaireStatus: {
    Active: 'Actif',
    Inactive: 'Inactif',
    Archived: 'Archivé'
  },
  missionStatus: {
    Proposed: 'Proposée',
    Ongoing: 'En cours',
    Finished: 'Terminée',
    Suspended: 'Suspendue',
    Cancelled: 'Annulée'
  },
  missionDomain: {
    'Solidarité': 'Solidarité',
    'Santé': 'Santé',
    'Éducation pour tous': 'Éducation pour tous',
    'Culture et loisirs': 'Culture et loisirs',
    'Sport': 'Sport',
    'Environnement': 'Environnement',
    'Mémoire et citoyenneté': 'Mémoire et citoyenneté',
    'Développement international et action humanitaire': 'Développement international et action humanitaire',
    'Intervention d\u2019urgence': 'Intervention d\u2019urgence',
    'Cadre de vie': 'Cadre de vie',
    'Prévention des discriminations': 'Prévention des discriminations',
    'Agriculture': 'Agriculture',
    'Autre': 'Autre'
  },
  suiviStatus: {
    Planned: 'Planifié',
    Ongoing: 'En cours',
    Done: 'Terminé',
    Cancelled: 'Annulé'
  },
  suiviType: {
    PointDeSuivi: 'Point de suivi',
    Entretien: 'Entretien',
    Mobilisation: 'Mobilisation'
  },
  documentType: {
    Convention: 'Convention',
    Attestation: 'Attestation',
    Cerfa: 'Cerfa',
    Justificatif: 'Justificatif',
    Rapport: 'Rapport',
    Courrier: 'Courrier'
  },
  formationType: {
    Civique: 'Civique et citoyenne',
    PSC1: 'Premiers secours (PSC1)',
    Informatique: 'Informatique',
    Communication: 'Communication',
    GestionProjet: 'Gestion de projet',
    Environnement: 'Environnement',
    Autre: 'Autre'
  },
  formationStatus: {
    Planned: 'Planifiée',
    InProgress: 'En cours',
    Done: 'Réalisée',
    Cancelled: 'Annulée'
  },
  activityStatus: {
    Etudiant: 'Étudiant',
    EnEmploi: 'En emploi',
    EnRechercheEmploi: 'En recherche d\u2019emploi',
    SansActivite: 'Sans activité',
    Autre: 'Autre'
  },
  studyLevel: {
    DiplomeSuperieur: 'Diplôme supérieur',
    Baccalaureat: 'Baccalauréat',
    NiveauBac: 'Niveau Bac',
    CAPBEP: 'CAP / BEP',
    Brevet: 'Brevet',
    Aucun: 'Aucun'
  },
  gender: {
    Male: 'Homme',
    Female: 'Femme',
    Other: 'Autre'
  }
}

const OPTIONS = {
  volontaireStatus: Object.keys(LABELS.volontaireStatus),
  missionStatus: Object.keys(LABELS.missionStatus),
  missionDomain: Object.keys(LABELS.missionDomain),
  suiviStatus: Object.keys(LABELS.suiviStatus),
  suiviType: Object.keys(LABELS.suiviType),
  documentType: Object.keys(LABELS.documentType),
  formationType: Object.keys(LABELS.formationType),
  formationStatus: Object.keys(LABELS.formationStatus),
  activityStatus: Object.keys(LABELS.activityStatus),
  studyLevel: Object.keys(LABELS.studyLevel),
  gender: Object.keys(LABELS.gender)
}

function label(objEnum, key) {
  const map = LABELS[objEnum]
  return map && map[key] !== undefined ? map[key] : key
}

// ---------------------------------------------------------------------
// Stockage
// ---------------------------------------------------------------------

function defaultData() {
  return {
    structures: [],
    volontaires: [],
    missions: [],
    pointsSuivi: [],
    documents: [],
    formations: [],
    conges: []
  }
}

function isoDateNow() {
  return new Date().toISOString().slice(0, 10)
}

// Migration : les formations étaient stockées sur chaque volontaire.
// Elles sont désormais une entité à part entière (db.formations).
function extractEmbeddedFormations(parsed) {
  const list = []
  ;(parsed.volontaires || []).forEach(v => {
    if (Array.isArray(v.formations) && v.formations.length) {
      v.formations.forEach(f => {
        list.push({
          id: uid('form'),
          createdAt: isoDateNow(),
          title: f.title || 'Formation',
          type: f.type || 'Autre',
          organisme: f.organisme || null,
          date: f.date || null,
          status: f.status || 'Done',
          volontaireId: v.id,
          missionId: null,
          notes: ''
        })
      })
      delete v.formations
    }
  })
  return list
}

// Nettoie les enregistrements corrompus (anciennes versions écrivant des
// champs vides) : on ne garde que les fiches avec une identité exploitable.
function sanitizeData(data) {
  const out = Object.assign(defaultData(), data || {})
  out.volontaires = (out.volontaires || []).filter(v => v && v.firstName && v.lastName)
  out.missions = (out.missions || []).filter(m => m && m.title)
  out.formations = (out.formations || []).filter(f => f && f.title)
  out.pointsSuivi = (out.pointsSuivi || []).filter(p => p && (p.volontaireId || p.date))
  out.documents = (out.documents || []).filter(d => d && d.name)
  out.conges = (out.conges || []).filter(c => c && c.volontaireId && c.date)
  return out
}

function loadData() {
  try {
    const raw = store.get(DB_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.volontaires) {
        const base = defaultData()
        const embedded = extractEmbeddedFormations(parsed)
        return sanitizeData({
          ...base,
          ...parsed,
          structures: parsed.structures || [],
          missions: parsed.missions || [],
          pointsSuivi: parsed.pointsSuivi || [],
          documents: parsed.documents || [],
          conges: parsed.conges || [],
          formations: (parsed.formations || []).concat(embedded)
        })
      }
    }
  } catch (e) {
    console.warn('Lecture des données impossible :', e)
  }
  return defaultData()
}

function saveData(data) {
  store.set(DB_KEY, JSON.stringify(data))
}

function loadStructure() {
  return loadData().structures[0] || null
}

// ---------------------------------------------------------------------
// Séquenceurs d'identifiants
// ---------------------------------------------------------------------

function nextVolontaireNumber(structure) {
  const base = 'VOL-' + new Date().getFullYear() + '-'
  const yearPrefix = base
  const xs = loadData().volontaires.filter(v => v.fileNumber && v.fileNumber.startsWith(yearPrefix))
  let maxSeq = 0
  xs.forEach(v => {
    const n = parseInt(v.fileNumber.slice(yearPrefix.length), 10)
    if (!isNaN(n) && n > maxSeq) maxSeq = n
  })
  return yearPrefix + String(maxSeq + 1).padStart(4, '0')
}

// ---------------------------------------------------------------------
// Données de démonstration
// ---------------------------------------------------------------------

function seedDemo() {
  const now = new Date()
  const iso = d => (d ? d.toISOString().slice(0, 10) : null)

  const structId = 'struct-1'
  const structure = {
    id: structId,
    type: 'Commune',
    name: 'Commune de Démonstration',
    zipcode: '33000',
    city: 'Bordeaux',
    address: 'Place de la Mairie',
    phone: '0102030405',
    email: 'contact@demo.fr'
  }

  // Volontaires ---------------------------------------------------------
  let s = iso(new Date(now.getFullYear(), 0, 5))
  let e = iso(new Date(now.getFullYear(), 9, 31))
  const volontaires = [
    {
      id: 'vol-1',
      fileNumber: 'VOL-' + now.getFullYear() + '-0001',
      status: 'Active',
      firstName: 'Léa',
      lastName: 'Bernard',
      gender: 'Female',
      birthDate: '2001-03-14',
      email: 'lea.bernard@demo.fr',
      phone: '0601020304',
      city: 'Bordeaux',
      zipcode: '33000',
      activityStatus: 'Etudiant',
      studyLevel: 'NiveauBac',
      dateDebutVolontariat: s,
      dateFinVolontariat: e,
      hoursPerWeek: 24,
      monthlyIndemnite: 619.83,
      referents: ['Tuteur Camille Durand'],
      additionalInformation: 'Mission en médiation numérique.'
    },
    {
      id: 'vol-2',
      fileNumber: 'VOL-' + now.getFullYear() + '-0002',
      status: 'Active',
      firstName: 'Hugo',
      lastName: 'Moreau',
      gender: 'Male',
      birthDate: '2002-07-22',
      email: 'hugo.moreau@demo.fr',
      phone: '0605060708',
      city: 'Talence',
      zipcode: '33400',
      activityStatus: 'SansActivite',
      studyLevel: 'Baccalaureat',
      dateDebutVolontariat: s,
      dateFinVolontariat: e,
      hoursPerWeek: 28,
      monthlyIndemnite: 619.83,
      referents: ['Tuteur Camille Durand'],
      additionalInformation: 'Sensibilisation à l\u2019environnement.'
    },
    {
      id: 'vol-3',
      fileNumber: 'VOL-' + now.getFullYear() + '-0003',
      status: 'Inactive',
      firstName: 'Sofia',
      lastName: 'Nguyen',
      gender: 'Female',
      birthDate: '2000-11-02',
      email: 'sofia.nguyen@demo.fr',
      phone: '0611223344',
      city: 'Mérignac',
      zipcode: '33700',
      activityStatus: 'EnRechercheEmploi',
      studyLevel: 'DiplomeSuperieur',
      dateDebutVolontariat: iso(new Date(now.getFullYear() - 1, 0, 10)),
      dateFinVolontariat: iso(new Date(now.getFullYear() - 1, 8, 30)),
      hoursPerWeek: 30,
      monthlyIndemnite: 619.83,
      referents: ['Tuteur Julien Martin'],
      additionalInformation: 'Fin de volontariat effectuée.'
    }
  ]

  // Missions ------------------------------------------------------------
  const missions = [
    {
      id: 'mis-1',
      title: 'Médiation numérique auprès des seniors',
      domain: 'Solidarité',
      hostStructure: 'Association NuméricoSolidaire',
      hostCity: 'Bordeaux',
      hostZipcode: '33000',
      dateDebut: iso(new Date(now.getFullYear(), 0, 5)),
      dateFinPrevision: iso(new Date(now.getFullYear(), 9, 31)),
      volontaireId: 'vol-1',
      status: 'Ongoing',
      tuteurFirstName: 'Camille',
      tuteurLastName: 'Durand',
      tuteurEmail: 'tuteur@demo.fr',
      description: 'Aider les personnes âgées à utiliser les outils numériques du quotidien.'
    },
    {
      id: 'mis-2',
      title: 'Sensibilisation à l\u2019environnement en milieu scolaire',
      domain: 'Environnement',
      hostStructure: 'École Primaire Jean Jaurès',
      hostCity: 'Talence',
      hostZipcode: '33400',
      dateDebut: iso(new Date(now.getFullYear(), 0, 5)),
      dateFinPrevision: iso(new Date(now.getFullYear(), 9, 31)),
      volontaireId: 'vol-2',
      status: 'Ongoing',
      tuteurFirstName: 'Camille',
      tuteurLastName: 'Durand',
      tuteurEmail: 'tuteur@demo.fr',
      description: 'Animer des ateliers de sensibilisation au tri et à la biodiversité.'
    },
    {
      id: 'mis-3',
      title: 'Accompagnement à l\u2019alphabétisation',
      domain: 'Éducation pour tous',
      hostStructure: 'Maison de Quartier du Lac',
      hostCity: 'Bordeaux',
      hostZipcode: '33000',
      dateDebut: iso(new Date(now.getFullYear() - 1, 1, 1)),
      dateFinPrevision: iso(new Date(now.getFullYear() - 1, 7, 31)),
      volontaireId: 'vol-3',
      status: 'Finished',
      tuteurFirstName: 'Julien',
      tuteurLastName: 'Martin',
      description: 'Soutien scolaire auprès d\u2019adultes en apprentissage de la langue française.'
    }
  ]

  // Points de suivi --------------------------------------------------------
  const pointsSuivi = [
    {
      id: 'pt-1',
      volontaireId: 'vol-1',
      missionId: 'mis-1',
      date: iso(new Date(now.getFullYear(), 2, 1)),
      type: 'PointDeSuivi',
      status: 'Done',
      synthesis: 'Intégration réussie, mission bien démarrée.'
    },
    {
      id: 'pt-2',
      volontaireId: 'vol-2',
      missionId: 'mis-2',
      date: iso(new Date(now.getFullYear(), 2, 5)),
      type: 'Entretien',
      status: 'Done',
      synthesis: 'Première animation d\u2019atelier effectuée, retour positif de l\u2019école.'
    },
    {
      id: 'pt-3',
      volontaireId: 'vol-1',
      missionId: 'mis-1',
      date: iso(new Date(now.getFullYear(), 4, 12)),
      type: 'PointDeSuivi',
      status: 'Planned',
      synthesis: 'Faire le point sur l\u2019autonomie du volontaire.'
    }
  ]

  // Documents ----------------------------------------------------------------
  const documents = [
    {
      id: 'doc-1',
      name: 'Convention de service civique',
      type: 'Convention',
      volontaireId: 'vol-1',
      missionId: 'mis-1',
      createdAt: iso(now),
      confidential: false
    },
    {
      id: 'doc-2',
      name: 'Attestation de présence',
      type: 'Attestation',
      volontaireId: 'vol-2',
      missionId: 'mis-2',
      createdAt: iso(now),
      confidential: false
    }
  ]

  // Formations -----------------------------------------------------------------
  const formations = [
    {
      id: 'form-1',
      title: 'Formation civique et citoyenne',
      type: 'Civique',
      volontaireId: 'vol-1',
      missionId: 'mis-1',
      organisme: 'Agence du Service Civique',
      date: iso(new Date(now.getFullYear(), 1, 10)),
      status: 'Done',
      notes: 'Session obligatoire de 2 jours.'
    },
    {
      id: 'form-2',
      title: 'Prévention et secours civiques (PSC1)',
      type: 'PSC1',
      volontaireId: 'vol-1',
      missionId: 'mis-1',
      organisme: 'Croix-Rouge Française',
      date: iso(new Date(now.getFullYear(), 2, 15)),
      status: 'Done',
      notes: ''
    },
    {
      id: 'form-3',
      title: 'Formation civique et citoyenne',
      type: 'Civique',
      volontaireId: 'vol-2',
      missionId: 'mis-2',
      organisme: 'Agence du Service Civique',
      date: iso(new Date(now.getFullYear(), 1, 12)),
      status: 'Done',
      notes: ''
    },
    {
      id: 'form-4',
      title: 'Sensibilisation à l\u2019environnement',
      type: 'Environnement',
      volontaireId: 'vol-2',
      missionId: 'mis-2',
      organisme: 'Association Écocitoyenne',
      date: iso(new Date(now.getFullYear(), 3, 8)),
      status: 'InProgress',
      notes: 'Atelier en milieu scolaire.'
    }
  ]

  // Congés -----------------------------------------------------------------
  const conges = [
    { id: 'cg-1', volontaireId: 'vol-1', date: iso(new Date(now.getFullYear(), 2, 8)) },
    { id: 'cg-2', volontaireId: 'vol-1', date: iso(new Date(now.getFullYear(), 2, 9)) },
    { id: 'cg-3', volontaireId: 'vol-2', date: iso(new Date(now.getFullYear(), 3, 20)) },
    { id: 'cg-4', volontaireId: 'vol-2', date: iso(new Date(now.getFullYear(), 3, 21)) },
    { id: 'cg-5', volontaireId: 'vol-2', date: iso(new Date(now.getFullYear(), 3, 22)) }
  ]

  return {
    structures: [structure],
    volontaires,
    missions,
    pointsSuivi,
    documents,
    formations,
    conges
  }
}

// ---------------------------------------------------------------------
// Utilitaires génériques
// ---------------------------------------------------------------------

function uid(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

function formatDate(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr + (isoStr.length === 10 ? 'T00:00:00' : ''))
  if (isNaN(d.getTime())) return isoStr
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatEuro(value) {
  if (value === null || value === undefined || value === '') return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
    Number(value)
  )
}

function formatFileSize(bytes) {
  if (!bytes || bytes < 1024) return (bytes || 0) + ' o'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko'
  return (bytes / (1024 * 1024)).toFixed(1) + ' Mo'
}

// ---------------------------------------------------------------------
// Gestion des droits à congés (2 jours/mois pour service civique)
// Le total est calculé sur la période de volontariat (dateDebutVolontariat à dateFinVolontariat)
// ---------------------------------------------------------------------

function getVoluntariatMonths(volontaireId) {
  const data = loadData()
  const v = data.volontaires.find(v => v.id === volontaireId)
  if (!v || !v.dateDebutVolontariat || !v.dateFinVolontariat) return 0
  
  const start = new Date(v.dateDebutVolontariat + 'T00:00:00')
  const end = new Date(v.dateFinVolontariat + 'T00:00:00')
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0
  if (end < start) return 0
  
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
  return Math.max(1, months)
}

function getTotalCongeEntitlement(volontaireId) {
  return getVoluntariatMonths(volontaireId) * CONGES_ENTITLEMENT_PER_MONTH
}

function getUsedCongeDays(volontaireId) {
  const data = loadData()
  const v = data.volontaires.find(v => v.id === volontaireId)
  if (!v || !v.dateDebutVolontariat || !v.dateFinVolontariat) return 0
  
  const start = new Date(v.dateDebutVolontariat + 'T00:00:00')
  const end = new Date(v.dateFinVolontariat + 'T00:00:00')
  
  return data.conges.filter(c => {
    if (c.volontaireId !== volontaireId) return false
    const d = new Date(c.date + 'T00:00:00')
    return d >= start && d <= end
  }).length
}

function canAddConge(volontaireId, dateIso) {
  const data = loadData()
  const v = data.volontaires.find(v => v.id === volontaireId)
  if (!v || !v.dateDebutVolontariat || !v.dateFinVolontariat) return false
  
  const start = new Date(v.dateDebutVolontariat + 'T00:00:00')
  const end = new Date(v.dateFinVolontariat + 'T00:00:00')
  const date = new Date(dateIso + 'T00:00:00')
  
  if (date < start || date > end) return false
  
  const totalEntitlement = getTotalCongeEntitlement(volontaireId)
  const usedDays = getUsedCongeDays(volontaireId)
  return usedDays < totalEntitlement
}

function getRemainingCongeDays(volontaireId) {
  const totalEntitlement = getTotalCongeEntitlement(volontaireId)
  const usedDays = getUsedCongeDays(volontaireId)
  return Math.max(0, totalEntitlement - usedDays)
}