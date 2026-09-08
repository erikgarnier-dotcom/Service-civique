/* Application de suivi des services civiques.
 * Logique de navigation, d'affichage et de CRUD sur les données locales. */

(function () {
  'use strict'

  // ------------------------------------------------------------------
  // Références DOM
  // ------------------------------------------------------------------
  const $ = sel => document.querySelector(sel)
  const $$ = sel => Array.from(document.querySelectorAll(sel))

  const detailPanel = $('#detail-panel')
  const detailPanelTitle = $('#detail-panel-title')
  const detailPanelBody = $('#detail-panel-body')
  const toastEl = $('#toast')

  let db = loadData()

  // ------------------------------------------------------------------
  // Persistance
  // ------------------------------------------------------------------
  function commit() {
    saveData(db)
    renderAll()
  }

  // ------------------------------------------------------------------
  // Navigation
  // ------------------------------------------------------------------
  const views = ['dashboard', 'volontaires', 'missions', 'formations', 'points', 'conges', 'documents', 'rapports']

  function showView(name) {
    views.forEach(v => {
      const section = $('#view-' + v)
      const link = document.querySelector('.main-nav__link[data-view="' + v + '"]')
      section.classList.toggle('active', v === name)
      if (link) link.classList.toggle('active', v === name)
    })
  }

  function bindNavigation() {
    document.querySelectorAll('.main-nav__link').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault()
        showView(link.dataset.view)
        renderAll()
      })
    })
    $('#brand-home').addEventListener('click', e => {
      e.preventDefault()
      showView('dashboard')
      renderAll()
    })
  }

  // ------------------------------------------------------------------
  // Helpers de rendu
  // ------------------------------------------------------------------
  function badge(status, kind) {
    const s = status || 'Unknown'
    const text = label(convertEnumName(kind), s) || s
    return '<span class="badge badge--' + s.toLowerCase() + '">' + text + '</span>'
  }

  function convertEnumName(singular) {
    // "volontaireStatus" is already the enum key used in LABELS
    return singular
  }

  function getVolontaire(id) {
    return db.volontaires.find(v => v.id === id) || null
  }

  function getMission(id) {
    return db.missions.find(m => m.id === id) || null
  }

  function volontaireName(id) {
    const v = getVolontaire(id)
    if (!v) return '—'
    const name = ((v.firstName || '') + ' ' + (v.lastName || '')).trim()
    return name || '—'
  }

  function missionTitle(id) {
    const m = getMission(id)
    return m ? m.title : '—'
  }

  function actionButtons(methods, id) {
    let html = ''
    if (methods.view) html += '<button class="btn btn--sm btn--secondary" data-act="view" data-id="' + id + '">Voir</button>'
    if (methods.edit) html += '<button class="btn btn--sm btn--secondary" data-act="edit" data-id="' + id + '">Modifier</button>'
    if (methods.delete) html += '<button class="btn btn--sm btn--danger" data-act="delete" data-id="' + id + '">Supprimer</button>'
    return '<div class="actions">' + html + '</div>'
  }

  // ------------------------------------------------------------------
  // Rendu global
  // ------------------------------------------------------------------
  function renderAll() {
    renderDashboard()
    renderVolontaires()
    renderMissions()
    renderFormations()
    renderPoints()
    renderConges()
    renderDocuments()
    renderRapports()
  }

  // ------------------------------------------------------------------
  // Tableau de bord
  // ------------------------------------------------------------------
  function renderDashboard() {
    const active = db.volontaires.filter(v => v.status === 'Active').length
    const missionsOngoing = db.missions.filter(m => m.status === 'Ongoing').length
    const documentsCount = db.documents.length
    const pointsDone = db.pointsSuivi.filter(p => p.status === 'Done').length
    const pointsPlanned = db.pointsSuivi.filter(
      p => p.status === 'Planned' || p.status === 'Ongoing'
    ).length

    $('#dashboard-cards').innerHTML = [
      card(db.volontaires.length, 'Volontaires'),
      card(active, 'Volontaires actifs'),
      card(db.missions.length, 'Missions'),
      card(missionsOngoing, 'Missions en cours'),
      card(db.formations.length, 'Formations'),
      card(db.pointsSuivi.length, 'Points de suivi'),
      card(pointsDone, 'Points terminés'),
      card(pointsPlanned, 'Points à venir'),
      card(documentsCount, 'Documents')
    ].join('')

    // Volontaires par statut
    renderBar('chart-status', db.volontaires, 'status', 'volontaireStatus')
    // Missions par statut
    renderBar('chart-missions', db.missions, 'status', 'missionStatus')

    // Prochains points de suivi (triés par date de RDV la plus proche)
    const upcoming = db.pointsSuivi
      .filter(p => p.status === 'Planned' || p.status === 'Ongoing')
      .map(p => ({ p, rdv: p.dueDate || p.date }))
      .sort((a, b) => (a.rdv > b.rdv ? 1 : a.rdv < b.rdv ? -1 : 0))
      .map(x => x.p)

    const wrap = $('#dashboard-upcoming')
    if (!upcoming.length) {
      wrap.innerHTML = '<p class="empty-state">Aucun point de suivi planifié.</p>'
    } else {
      wrap.innerHTML = upcoming
        .map(p => {
          return (
            '<div class="upcoming-item">' +
            '<span class="upcoming-item__who"><button type="button" class="link" data-act="fill" data-id="' + p.id + '">' + volontaireName(p.volontaireId) + '</button></span>' +
            '<span class="upcoming-item__what">' + label('suiviType', p.type) + '</span>' +
            badge(p.status, 'suiviStatus') +
            '<span class="upcoming-item__date">' + formatDate(p.dueDate || p.date) + '</span>' +
            '</div>'
          )
        })
        .join('')
    }
  }

  function card(value, labelText) {
    return (
      '<div class="stat-card">' +
      '<div class="stat-card__value">' + value + '</div>' +
      '<div class="stat-card__label">' + labelText + '</div>' +
      '</div>'
    )
  }

  function renderBar(containerId, rows, field, enumKey) {
    const counts = {}
    rows.forEach(r => {
      counts[r[field]] = (counts[r[field]] || 0) + 1
    })
    const entries = Object.keys(counts).sort()
    const total = rows.length || 1
    const container = $('#' + containerId)
    container.innerHTML = ''

    if (!entries.length) {
      container.innerHTML = '<p class="empty-state">Aucune donnée</p>'
      return
    }

    entries.forEach(key => {
      const n = counts[key]
      const pct = Math.round((n / total) * 100)
      const row = document.createElement('div')
      row.className = 'bar-row'
      row.innerHTML =
        '<span class="bar-row__label">' + escapeHtml(label(enumKey, key)) + '</span>' +
        '<div class="bar-row__track"><div class="bar-row__fill" style="width:' + pct + '%"></div></div>' +
        '<span class="bar-row__count">' + n + '</span>'
      container.appendChild(row)
    })
  }

  // ------------------------------------------------------------------
  // Volontaires
  // ------------------------------------------------------------------
  function renderVolontaires() {
    const search = $('#volontaires-search').value.trim().toLowerCase()
    let rows = db.volontaires.slice()
    if (search) {
      rows = rows.filter(v =>
        (v.firstName + ' ' + v.lastName + ' ' + (v.email || '') + ' ' + (v.city || '')).toLowerCase().includes(search)
      )
    }
    rows.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''))

    const body = $('#volontaires-body')
    $('#volontaires-empty').hidden = rows.length > 0
    body.innerHTML = rows
      .map(v => {
        const span =
          v.activityStatus && label('activityStatus', v.activityStatus) + ' · ' + label('studyLevel', v.studyLevel)
        return (
          '<tr>' +
          '<td>' + escapeHtml(v.fileNumber || '—') + '</td>' +
          '<td>' + escapeHtml(v.lastName) + '</td>' +
          '<td>' + escapeHtml(v.firstName) + '</td>' +
          '<td>' + escapeHtml(v.email || '—') + '</td>' +
          '<td>' + escapeHtml(v.city || '—') + '</td>' +
          '<td>' + escapeHtml(span || '—') + '</td>' +
          '<td>' + formatDate(v.dateDebutVolontariat) + ' → ' + formatDate(v.dateFinVolontariat) + '</td>' +
          '<td>' + badge(v.status, 'volontaireStatus') + '</td>' +
          '<td class="col-actions">' + actionButtons({ view: 1, edit: 1, delete: 1 }, v.id) + '</td>' +
          '</tr>'
        )
      })
      .join('')
  }

  // ------------------------------------------------------------------
  // Missions
  // ------------------------------------------------------------------
  function renderMissions() {
    const rows = db.missions.slice().sort((a, b) => (a.title < b.title ? -1 : 1))
    $('#missions-empty').hidden = rows.length > 0
    $('#missions-body').innerHTML = rows
      .map(m => {
        return (
          '<tr>' +
          '<td>' + escapeHtml(m.title) + '</td>' +
          '<td>' + volontaireName(m.volontaireId) + '</td>' +
          '<td>' + escapeHtml(m.domain || '—') + '</td>' +
          '<td>' + escapeHtml(m.hostStructure || '—') + '</td>' +
          '<td>' + formatDate(m.dateDebut) + '</td>' +
          '<td>' + formatDate(m.dateFinPrevision) + '</td>' +
          '<td>' + badge(m.status, 'missionStatus') + '</td>' +
          '<td class="col-actions">' + actionButtons({ view: 1, edit: 1, delete: 1 }, m.id) + '</td>' +
          '</tr>'
        )
      })
      .join('')
  }

  // ------------------------------------------------------------------
  // Formations
  // ------------------------------------------------------------------
  function renderFormations() {
    const rows = db.formations.slice().sort((a, b) => (a.date < b.date ? 1 : -1))
    $('#formations-empty').hidden = rows.length > 0
    $('#formations-body').innerHTML = rows
      .map(f => {
        return (
          '<tr>' +
          '<td>' + escapeHtml(f.title) + '</td>' +
          '<td>' + label('formationType', f.type) + '</td>' +
          '<td>' + volontaireName(f.volontaireId) + '</td>' +
          '<td>' + escapeHtml(f.organisme || '—') + '</td>' +
          '<td>' + formatDate(f.date) + '</td>' +
          '<td>' + badge(f.status, 'formationStatus') + '</td>' +
          '<td class="col-actions">' + actionButtons({ view: 1, edit: 1, delete: 1 }, f.id) + '</td>' +
          '</tr>'
        )
      })
      .join('')
  }

  // ------------------------------------------------------------------
  // Rapports & statistiques
  // ------------------------------------------------------------------
  function renderRapports() {
    const doneFormations = db.formations.filter(f => f.status === 'Done').length
    $('#rapport-cards').innerHTML = [
      card(db.volontaires.length, 'Volontaires'),
      card(db.missions.length, 'Missions'),
      card(db.formations.length, 'Formations'),
      card(doneFormations, 'Formations réalisées'),
      card(db.pointsSuivi.length, 'Points de suivi'),
      card(db.documents.length, 'Documents')
    ].join('')

    renderBar('chart-volontaires-ville', db.volontaires, 'city')
    renderBar('chart-volontaires-situation', db.volontaires, 'activityStatus', 'activityStatus')
    renderBar('chart-missions-domaine', db.missions, 'domain')
    renderBar('chart-formations-statut', db.formations, 'status', 'formationStatus')
    renderBar('chart-formations-type', db.formations, 'type', 'formationType')
    renderBar('chart-points-type', db.pointsSuivi, 'type', 'suiviType')
  }

  // ------------------------------------------------------------------
  // Points de suivi
  // ------------------------------------------------------------------
  function renderPoints() {
    const rows = db.pointsSuivi.slice().sort((a, b) => (a.date < b.date ? 1 : -1))
    $('#points-empty').hidden = rows.length > 0
    $('#points-body').innerHTML = rows
      .map(p => {
        return (
          '<tr>' +
          '<td>' + formatDate(p.date) + '</td>' +
          '<td>' + volontaireName(p.volontaireId) + '</td>' +
          '<td>' + missionTitle(p.missionId) + '</td>' +
          '<td>' + label('suiviType', p.type) + '</td>' +
          '<td>' + escapeHtml(truncate(p.synthesis || '', 60)) + '</td>' +
          '<td>' + badge(p.status, 'suiviStatus') + '</td>' +
          '<td class="col-actions">' + actionButtons({ view: 1, edit: 1, delete: 1 }, p.id) + '</td>' +
          '</tr>'
        )
      })
      .join('')
  }

  // ------------------------------------------------------------------
  // Congés des volontaires
  // ------------------------------------------------------------------
  const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
  let congesVolontaireId = null
  let congesMonth = { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }
  let congesSelectionStart = null

  function congesDatesForVolontaire(volontaireId) {
    return db.conges.filter(c => c.volontaireId === volontaireId).map(c => c.date)
  }

  function addDaysIso(isoStr, n) {
    const d = new Date(isoStr + 'T00:00:00')
    d.setDate(d.getDate() + n)
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }

  function isoFromYMD(y, m, day) {
    const mm = String(m).padStart(2, '0')
    const dd = String(day).padStart(2, '0')
    return y + '-' + mm + '-' + dd
  }

  function renderConges() {
    $('#conges-month-label').textContent = MONTHS_FR[congesMonth.month - 1] + ' ' + congesMonth.year

    const sel = $('#conges-volontaire')
    sel.innerHTML =
      '<option value="">— Choisir un volontaire —</option>' +
      db.volontaires
        .map(v => {
          const name = ((v.firstName || '') + ' ' + (v.lastName || '')).trim()
          return '<option value="' + v.id + '"' + (v.id === congesVolontaireId ? ' selected' : '') + '>' + escapeHtml(name) + '</option>'
        })
        .join('')

    // Ne pas réinitialiser congesSelectionStart ici, c'est fait dans selectCongeRange/toggleCongeDay
    $('#conges-calendar').innerHTML = renderCongesCalendar()
    renderCongesSelectionNotice()
    renderCongesTable()
  }

  function renderCongesCalendar() {
    const y = congesMonth.year
    const m = congesMonth.month
    const daysInMonth = new Date(y, m, 0).getDate()
    const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7
    const leaveDates = congesVolontaireId ? new Set(congesDatesForVolontaire(congesVolontaireId)) : new Set()
    const todayIso = today()
    const hasVolontaire = congesVolontaireId !== null
    const remaining = hasVolontaire ? getRemainingCongeDays(congesVolontaireId) : 0
    
    let serviceStart = null
    let serviceEnd = null
    if (hasVolontaire) {
      const v = db.volontaires.find(v => v.id === congesVolontaireId)
      if (v && v.dateDebutVolontariat && v.dateFinVolontariat) {
        serviceStart = v.dateDebutVolontariat
        serviceEnd = v.dateFinVolontariat
      }
    }

    let html =
      '<div class="calendar-grid">' +
      ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => '<div class="calendar-head">' + d + '</div>').join('')

    for (let i = 0; i < offset; i++) html += '<div class="calendar-day is-empty"></div>'

    for (let day = 1; day <= daysInMonth; day++) {
      const dateIso = isoFromYMD(y, m, day)
      const isLeave = hasVolontaire && leaveDates.has(dateIso)
      const inServicePeriod = hasVolontaire && serviceStart && serviceEnd && dateIso >= serviceStart && dateIso <= serviceEnd
      const canAdd = hasVolontaire && !isLeave && inServicePeriod && canAddConge(congesVolontaireId, dateIso)
      const atLimit = hasVolontaire && !isLeave && remaining === 0
      const outOfService = hasVolontaire && (!serviceStart || !serviceEnd || dateIso < serviceStart || dateIso > serviceEnd)
      html +=
        '<button type="button" class="calendar-day' +
        (isLeave ? ' is-leave' : '') +
        (dateIso === todayIso ? ' is-today' : '') +
        (congesSelectionStart === dateIso ? ' is-start' : '') +
        (atLimit ? ' is-at-limit' : '') +
        (outOfService ? ' is-out-of-service' : '') +
        (hasVolontaire ? '' : ' is-disabled') +
        '" data-date="' + dateIso + '"' +
        (hasVolontaire && !atLimit && !outOfService ? '' : ' disabled') +
        '>' +
        day +
        (isLeave ? '<span class="calendar-check">✓</span>' : '') +
        (atLimit ? '<span class="calendar-limit">⛔</span>' : '') +
        (outOfService ? '<span class="calendar-out-of-service">—</span>' : '') +
        '</button>'
    }
    return html + '</div>'
  }

  function renderCongesSelectionNotice() {
    const el = $('#conges-selection')
    if (!congesVolontaireId) {
      el.textContent = 'Sélectionnez un volontaire pour commencer.'
      return
    }
    const name = volontaireName(congesVolontaireId)
    const remaining = getRemainingCongeDays(congesVolontaireId)
    const totalEntitlement = getTotalCongeEntitlement(congesVolontaireId)
    const used = totalEntitlement - remaining
    if (congesSelectionStart) {
      el.textContent = name + ' · ' + used + '/' + totalEntitlement + ' jour(s) utilisés · ' + remaining + ' restant(s) — début : ' + formatDate(congesSelectionStart) + ' · cliquez sur une date de fin.'
    } else {
      el.textContent = name + ' · ' + used + '/' + totalEntitlement + ' jour(s) utilisés · ' + remaining + ' restant(s) — cliquez une journée, ou deux dates pour cocher toute la période.'
    }
  }

  function renderCongesTable() {
    const rows = db.conges
      .slice()
      .sort((a, b) => (a.volontaireId === b.volontaireId ? a.date.localeCompare(b.date) : a.volontaireId.localeCompare(b.volontaireId)))
    const groups = []
    rows.forEach(c => {
      const last = groups[groups.length - 1]
      if (last && last.volontaireId === c.volontaireId && addDaysIso(last.end, 1) === c.date) {
        last.end = c.date
        last.count++
      } else {
        groups.push({ volontaireId: c.volontaireId, start: c.date, end: c.date, count: 1 })
      }
    })

    $('#conges-empty').hidden = groups.length > 0
    $('#conges-body').innerHTML = groups
      .map(g => {
        return (
          '<tr>' +
          '<td>' + escapeHtml(volontaireName(g.volontaireId)) + '</td>' +
          '<td>' + formatDate(g.start) + '</td>' +
          '<td>' + formatDate(g.end) + '</td>' +
          '<td>' + g.count + '</td>' +
          '<td class="col-actions">' +
          '<button type="button" class="btn btn--sm btn--danger" data-act="delete" data-id="' + g.volontaireId + '" data-start="' + g.start + '" data-end="' + g.end + '">Supprimer</button>' +
          '</td>' +
          '</tr>'
        )
      })
      .join('')
  }

  function toggleCongeDay(dateIso) {
    const idx = db.conges.findIndex(c => c.volontaireId === congesVolontaireId && c.date === dateIso)
    if (idx >= 0) {
      db.conges.splice(idx, 1)
      commit()
    } else if (canAddConge(congesVolontaireId, dateIso)) {
      db.conges.push({ id: uid('cg'), volontaireId: congesVolontaireId, date: dateIso, createdAt: today() })
      commit()
    } else {
      const totalEntitlement = getTotalCongeEntitlement(congesVolontaireId)
      toast('Limite de ' + totalEntitlement + ' jours de congé atteinte pour la période de volontariat ⚠')
    }
  }

  function selectCongeRange(dateIso) {
    if (congesSelectionStart === null) {
      congesSelectionStart = dateIso
      renderConges()
      return
    }
    let start = congesSelectionStart
    let end = dateIso
    if (end < start) { const t = start; start = end; end = t }
    congesSelectionStart = null
    const existing = new Set(congesDatesForVolontaire(congesVolontaireId))
    let added = 0
    let blocked = 0
    let d = start
    while (d <= end) {
      if (!existing.has(d)) {
        if (canAddConge(congesVolontaireId, d)) {
          db.conges.push({ id: uid('cg'), volontaireId: congesVolontaireId, date: d, createdAt: today() })
          added++
        } else {
          blocked++
        }
      }
      d = addDaysIso(d, 1)
    }
    commit()
    if (added > 0) toast(added + ' jour(s) de congé ajouté(s) ✔')
    if (blocked > 0) {
      const totalEntitlement = getTotalCongeEntitlement(congesVolontaireId)
      toast(blocked + ' jour(s) bloqué(s) : limite de ' + totalEntitlement + ' jours de congé atteinte pour la période de volontariat ⚠')
    }
  }

  function handleCongeDayClick(dateIso) {
    console.log('handleCongeDayClick called with:', dateIso)
    if (!congesVolontaireId) {
      toast('Sélectionnez d\u2019abord un volontaire.')
      return
    }
    const isLeave = db.conges.some(c => c.volontaireId === congesVolontaireId && c.date === dateIso)
    console.log('isLeave:', isLeave, 'congesSelectionStart:', congesSelectionStart)
    if (isLeave && congesSelectionStart === null) toggleCongeDay(dateIso)
    else selectCongeRange(dateIso)
  }

  function deleteCongePeriod(volontaireId, start, end) {
    const from = start < end ? start : end
    const to = start < end ? end : start
    openConfirm(
      'Supprimer les congés',
      'Supprimer la période de congés du ' + formatDate(from) + ' au ' + formatDate(to) + ' ?',
      () => {
        db.conges = db.conges.filter(c => !(c.volontaireId === volontaireId && c.date >= from && c.date <= to))
        commit()
        closeModal()
        toast('Congés supprimés ✔')
      }
    )
  }

  function bindCongesControls() {
    $('#conges-volontaire').addEventListener('change', e => {
      congesVolontaireId = e.target.value || null
      congesSelectionStart = null
      renderConges()
    })
    $('#conges-prev').addEventListener('click', () => {
      congesMonth.month--
      if (congesMonth.month < 1) { congesMonth.month = 12; congesMonth.year-- }
      renderConges()
    })
    $('#conges-next').addEventListener('click', () => {
      congesMonth.month++
      if (congesMonth.month > 12) { congesMonth.month = 1; congesMonth.year++ }
      renderConges()
    })
    $('#conges-today').addEventListener('click', () => {
      const now = new Date()
      congesMonth = { year: now.getFullYear(), month: now.getMonth() + 1 }
      renderConges()
    })
    $('#conges-calendar').addEventListener('click', e => {
      const day = e.target.closest('.calendar-day')
      if (day && day.dataset.date) {
        console.log('Calendar day clicked:', day.dataset.date, 'disabled:', day.disabled)
        handleCongeDayClick(day.dataset.date)
      }
    })
    $('#btn-conge-add').addEventListener('click', () => {
      if (!db.volontaires.length) {
        toast('Ajoutez d\u2019abord un volontaire.')
        return
      }
      congesVolontaireId = congesVolontaireId || db.volontaires[0].id
      renderConges()
      $('#view-conges').scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  // ------------------------------------------------------------------
  // Documents
  // ------------------------------------------------------------------
  function renderDocuments() {
    const rows = db.documents.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    $('#documents-empty').hidden = rows.length > 0
    $('#documents-body').innerHTML = rows
      .map(d => {
        const hasFile = d.fileData
        const downloadBtn = hasFile
          ? '<button class="btn btn--sm btn--primary" data-act="download" data-id="' + d.id + '">Télécharger</button>'
          : ''
        return (
          '<tr>' +
          '<td>' + escapeHtml(d.name) + '</td>' +
          '<td>' + label('documentType', d.type) + '</td>' +
          '<td>' + volontaireName(d.volontaireId) + '</td>' +
          '<td>' + missionTitle(d.missionId) + '</td>' +
          '<td>' + formatDate(d.createdAt) + '</td>' +
          '<td>' + (d.confidential ? 'Oui' : 'Non') + '</td>' +
          '<td class="col-actions">' + actionButtons({ view: 1, edit: 1, delete: 1 }, d.id) + downloadBtn + '</td>' +
          '</tr>'
        )
      })
      .join('')
  }

  function truncate(s, n) {
    return s.length > n ? s.slice(0, n) + '…' : s
  }

  function listOr(itemsHtml) {
    return itemsHtml ? '<ul>' + itemsHtml + '</ul>' : '<p class="empty-state">Aucun élément</p>'
  }

  // ------------------------------------------------------------------
  // Modals
  // ------------------------------------------------------------------
  function openModal(title, html, onOpen) {
    detailPanelTitle.textContent = title
    detailPanelBody.innerHTML = html
    detailPanel.hidden = false
    detailPanel.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (onOpen) onOpen(detailPanelBody)
  }

  function closeModal() {
    detailPanel.hidden = true
    detailPanelBody.innerHTML = ''
  }

  // ------------------------------------------------------------------
  // Vue détail (volontaire / mission / point / document)
  // ------------------------------------------------------------------
  function showVolontaireDetail(id) {
    const v = getVolontaire(id)
    if (!v) return
    const missions = db.missions.filter(m => m.volontaireId === id)
    const points = db.pointsSuivi.filter(p => p.volontaireId === id)
    const docs = db.documents.filter(d => d.volontaireId === id)
    const formations = db.formations.filter(f => f.volontaireId === id)

    const html =
      '<div class="detail">' +
      '<h3>' + escapeHtml(v.firstName + ' ' + v.lastName) + '</h3>' +
      '<dl class="dl">' +
      dl('Numéro', escapeHtml(v.fileNumber || '—')) +
      dl('Email', escapeHtml(v.email || '—')) +
      dl('Téléphone', escapeHtml(v.phone || '—')) +
      dl('Genre', label('gender', v.gender)) +
      dl('Naissance', formatDate(v.birthDate)) +
      dl('Ville', escapeHtml(v.city || '—')) +
      dl('Situation', escapeHtml(label('activityStatus', v.activityStatus) + ' · ' + label('studyLevel', v.studyLevel))) +
      dl('Volontariat', formatDate(v.dateDebutVolontariat) + ' → ' + formatDate(v.dateFinVolontariat)) +
      dl('Heures / semaine', (v.hoursPerWeek ? v.hoursPerWeek + ' h' : '—')) +
      dl('Indemnité mensuelle', formatEuro(v.monthlyIndemnite)) +
      dl('Statut', badge(v.status, 'volontaireStatus')) +
      dl('Notes', escapeHtml(v.additionalInformation || '—')) +
      '</dl>' +
      '<h4>Missions (' + missions.length + ')</h4>' +
      listOr(missions.map(m => '<li>' + escapeHtml(m.title) + ' — ' + label('missionStatus', m.status) + '</li>').join('')) +
      '<h4>Points de suivi (' + points.length + ')</h4>' +
      listOr(points.map(p => '<li>' + formatDate(p.date) + ' — ' + label('suiviStatus', p.status) + '</li>').join('')) +
      '<h4>Documents (' + docs.length + ')</h4>' +
      listOr(docs.map(d => '<li>' + escapeHtml(d.name) + '</li>').join('')) +
      '<h4>Formations (' + formations.length + ')</h4>' +
      listOr(
        formations
          .map(f => '<li>' + escapeHtml(f.title) + ' — ' + label('formationStatus', f.status) + '</li>')
          .join('')
      ) +
      '</div>' +
      modalFooter()

    openModal('Volontaire : ' + v.firstName + ' ' + v.lastName, html)
  }

  function showMissionDetail(id) {
    const m = getMission(id)
    if (!m) return
    const v = getVolontaire(m.volontaireId)
    const points = db.pointsSuivi.filter(p => p.missionId === id)
    const html =
      '<div class="detail">' +
      '<h3>' + escapeHtml(m.title) + '</h3>' +
      '<dl class="dl">' +
      dl('Volontaire', v ? escapeHtml(v.firstName + ' ' + v.lastName) : '—') +
      dl('Domaine', escapeHtml(m.domain || '—')) +
      dl('Organisme d\u2019accueil', escapeHtml(m.hostStructure || '—')) +
      dl('Ville d\u2019accueil', escapeHtml((m.hostCity || '') + (m.hostZipcode ? ' (' + escapeHtml(m.hostZipcode) + ')' : ''))) +
      dl('Période', formatDate(m.dateDebut) + ' → ' + formatDate(m.dateFinPrevision)) +
      dl('Fin effective', formatDate(m.dateFinEffective)) +
      dl('Tuteur', escapeHtml((m.tuteurFirstName || '') + ' ' + (m.tuteurLastName || ''))) +
      dl('Statut', badge(m.status, 'missionStatus')) +
      dl('Description', escapeHtml(m.description || '—')) +
      '</dl>' +
      '<h4>Points de suivi (' + points.length + ')</h4>' +
      listOr(points.map(p => '<li>' + formatDate(p.date) + ' — ' + label('suiviStatus', p.status) + '</li>').join('')) +
      '</div>' +
      modalFooter()
    openModal('Mission : ' + m.title, html)
  }

  function showFormationDetail(id) {
    const f = db.formations.find(x => x.id === id)
    if (!f) return
    const html =
      '<div class="detail">' +
      '<dl class="dl">' +
      dl('Titre', escapeHtml(f.title)) +
      dl('Type', label('formationType', f.type)) +
      dl('Volontaire', volontaireName(f.volontaireId)) +
      dl('Mission', missionTitle(f.missionId)) +
      dl('Organisme', escapeHtml(f.organisme || '—')) +
      dl('Date', formatDate(f.date)) +
      dl('Statut', badge(f.status, 'formationStatus')) +
      dl('Notes', escapeHtml(f.notes || '—')) +
      '</dl>' +
      '</div>' +
      modalFooter()
    openModal('Formation : ' + f.title, html)
  }

  function showPointDetail(id) {
    const p = db.pointsSuivi.find(x => x.id === id)
    if (!p) return
    const history = p.history || []
    const historyHtml = history.length
      ? '<ul class="point-history">' +
        history
          .slice()
          .reverse()
          .map(h =>
            '<li class="point-history__item">' +
            '<div class="point-history__head">' + formatDateTime(h.savedAt) + ' — ' + label('suiviStatus', h.status) + '</div>' +
            (h.date ? '<div class="point-history__sub">Point du ' + formatDate(h.date) + (h.dueDate ? ' · échéance ' + formatDate(h.dueDate) : '') + '</div>' : '') +
            (h.synthesis ? '<div class="point-history__text">' + escapeHtml(h.synthesis) + '</div>' : '') +
            (h.privateSynthesis ? '<div class="point-history__text mod--private">' + escapeHtml(h.privateSynthesis) + '</div>' : '') +
            '</li>'
          )
          .join('') +
        '</ul>'
      : '<p class="empty-state">Aucun historique pour le moment.</p>'

    const html =
      '<div class="detail">' +
      '<dl class="dl">' +
      dl('Date', formatDate(p.date)) +
      dl('Volontaire', volontaireName(p.volontaireId)) +
      dl('Mission', missionTitle(p.missionId)) +
      dl('Type', label('suiviType', p.type)) +
      dl('Statut', badge(p.status, 'suiviStatus')) +
      dl('Échéance', formatDate(p.dueDate)) +
      dl('Synthèse', escapeHtml(p.synthesis || '—')) +
      dl('Synthèse privée', escapeHtml(p.privateSynthesis || '—')) +
      '</dl>' +
      '<h4>Historique des remplissages</h4>' +
      historyHtml +
      '</div>' +
      modalFooter()
    openModal('Point de suivi du ' + formatDate(p.date), html)
  }

  function showDocumentDetail(id) {
    const d = db.documents.find(x => x.id === id)
    if (!d) return
    const hasFile = d.fileData
    const downloadBtn = hasFile
      ? '<button class="btn btn--primary" data-act="download" data-id="' + d.id + '">Télécharger le fichier</button>'
      : '<span class="empty-state">Aucun fichier joint</span>'

    const html =
      '<div class="detail">' +
      '<dl class="dl">' +
      dl('Nom', escapeHtml(d.name)) +
      dl('Type', label('documentType', d.type)) +
      dl('Volontaire', volontaireName(d.volontaireId)) +
      dl('Mission', missionTitle(d.missionId)) +
      dl('Ajouté le', formatDate(d.createdAt)) +
      dl('Confidentiel', d.confidential ? 'Oui' : 'Non') +
      (hasFile ? dl('Fichier', escapeHtml(d.fileName || 'document') + ' (' + formatFileSize(d.fileSize || 0) + ')') : '') +
      '</dl>' +
      '<div class="detail-panel__footer">' +
      downloadBtn +
      '<button class="btn btn--secondary" data-act="close">Fermer</button>' +
      '</div>'
    openModal('Document : ' + d.name, html)
  }

  function downloadDocument(id) {
    const d = db.documents.find(x => x.id === id)
    if (!d || !d.fileData) return
    const link = document.createElement('a')
    link.href = d.fileData
    link.download = d.fileName || d.name
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  function dl(key, value) {
    return '<div class="dl__row"><dt>' + key + '</dt><dd>' + value + '</dd></div>'
  }

  function modalFooter() {
    return '<div class="detail-panel__footer"><button class="btn btn--secondary" data-act="close">Fermer</button></div>'
  }

  // ==================================================================
  // FORMULAIRES DE CRÉATION / ÉDITION
  // ==================================================================

  // ----- Volontaire -----
  function volontaireForm(v) {
    v = v || {}
    const field = (id, labelText, html) =>
      '<div class="field"><label for="' + id + '">' + labelText + '</label>' + html + '</div>'

    return (
      '<form id="form-volontaire">' +
      '<div class="form-row">' +
      field('firstName', 'Prénom', '<input class="input" id="firstName" name="firstName" value="' + escapeAttr(v.firstName || '') + '" required>') +
      field('lastName', 'Nom', '<input class="input" id="lastName" name="lastName" value="' + escapeAttr(v.lastName || '') + '" required>') +
      '</div>' +
      '<div class="form-row">' +
      field('email', 'Email', '<input class="input" type="email" id="email" name="email" value="' + escapeAttr(v.email || '') + '">') +
      field('phone', 'Téléphone', '<input class="input" id="phone" name="phone" value="' + escapeAttr(v.phone || '') + '">') +
      '</div>' +
      '<div class="form-row">' +
      field('city', 'Ville', '<input class="input" id="city" name="city" value="' + escapeAttr(v.city || '') + '">') +
      field('zipcode', 'Code postal', '<input class="input" id="zipcode" name="zipcode" value="' + escapeAttr(v.zipcode || '') + '">') +
      '</div>' +
      '<div class="form-row">' +
      field('gender', 'Genre', '<select class="select" id="gender" name="gender">' + options('gender', v.gender) + '</select>') +
      field('birthDate', 'Date de naissance', '<input class="input" type="date" id="birthDate" name="birthDate" value="' + escapeAttr(v.birthDate || '') + '">') +
      '</div>' +
      '<div class="form-row">' +
      field('activityStatus', 'Situation', '<select class="select" id="activityStatus" name="activityStatus">' + options('activityStatus', v.activityStatus) + '</select>') +
      field('studyLevel', 'Niveau d\u2019étude', '<select class="select" id="studyLevel" name="studyLevel">' + options('studyLevel', v.studyLevel) + '</select>') +
      '</div>' +
      '<div class="form-row">' +
      field('dateDebutVolontariat', 'Début du volontariat', '<input class="input" type="date" id="dateDebutVolontariat" name="dateDebutVolontariat" value="' + escapeAttr(v.dateDebutVolontariat || '') + '">') +
      field('dateFinVolontariat', 'Fin du volontariat', '<input class="input" type="date" id="dateFinVolontariat" name="dateFinVolontariat" value="' + escapeAttr(v.dateFinVolontariat || '') + '">') +
      '</div>' +
      '<div class="form-row">' +
      field('hoursPerWeek', 'Heures / semaine (24-35)', '<input class="input" type="number" id="hoursPerWeek" name="hoursPerWeek" min="24" max="35" value="' + escapeAttr(v.hoursPerWeek != null ? v.hoursPerWeek : '24') + '">') +
      field('monthlyIndemnite', 'Indemnité mensuelle (€)', '<input class="input" type="number" step="0.01" id="monthlyIndemnite" name="monthlyIndemnite" value="' + escapeAttr(v.monthlyIndemnite != null ? v.monthlyIndemnite : '619.83') + '">') +
      '</div>' +
      field('status', 'Statut', '<select class="select" id="status" name="status">' + options('volontaireStatus', v.status || 'Active') + '</select>') +
      field('additionalInformation', 'Notes', '<textarea class="textarea" id="additionalInformation" name="additionalInformation" rows="3">' + escapeHtml(v.additionalInformation || '') + '</textarea>') +
      '<div class="detail-panel__footer">' +
      '<button type="button" class="btn btn--secondary" data-act="close">Annuler</button>' +
      '<button type="submit" class="btn btn--primary">Enregistrer</button>' +
      '</div>' +
      '</form>'
    )
  }

  // ----- Mission -----
  function missionForm(m) {
    m = m || {}
    const field = (id, labelText, html) =>
      '<div class="field"><label for="' + id + '">' + labelText + '</label>' + html + '</div>'

    return (
      '<form id="form-mission">' +
      '<div class="form-row">' +
      field('volontaireId', 'Volontaire', '<select class="select" id="volontaireId" name="volontaireId" required>' + volontaireOptions(m.volontaireId) + '</select>') +
      field('domain', 'Domaine', '<select class="select" id="domain" name="domain"><option value="">—</option>' + options('missionDomain', m.domain) + '</select>') +
      '</div>' +
      field('title', 'Intitulé de la mission', '<input class="input" id="title" name="title" value="' + escapeAttr(m.title || '') + '" required>') +
      '<div class="form-row">' +
      field('hostStructure', 'Organisme d\u2019accueil', '<input class="input" id="hostStructure" name="hostStructure" value="' + escapeAttr(m.hostStructure || '') + '">') +
      field('hostCity', 'Ville d\u2019accueil', '<input class="input" id="hostCity" name="hostCity" value="' + escapeAttr(m.hostCity || '') + '">') +
      '</div>' +
      '<div class="form-row">' +
      field('dateDebut', 'Début', '<input class="input" type="date" id="dateDebut" name="dateDebut" value="' + escapeAttr(m.dateDebut || '') + '">') +
      field('dateFinPrevision', 'Fin prévisionnelle', '<input class="input" type="date" id="dateFinPrevision" name="dateFinPrevision" value="' + escapeAttr(m.dateFinPrevision || '') + '">') +
      '</div>' +
      field('status', 'Statut', '<select class="select" id="status" name="status">' + options('missionStatus', m.status || 'Proposed') + '</select>') +
      field('description', 'Description', '<textarea class="textarea" id="description" name="description" rows="3">' + escapeHtml(m.description || '') + '</textarea>') +
      '<div class="detail-panel__footer">' +
      '<button type="button" class="btn btn--secondary" data-act="close">Annuler</button>' +
      '<button type="submit" class="btn btn--primary">Enregistrer</button>' +
      '</div>' +
      '</form>'
    )
  }

  // ----- Point de suivi -----
  function pointForm(p, defaults) {
    p = p || {}
    defaults = defaults || {}
    // Les valeurs par défaut (ex. date du jour à la saisie) sont affichées
    // sans modifier l'enregistrement tant que le formulaire n'est pas validé.
    const v = Object.assign({}, p, defaults)
    const field = (id, labelText, html) =>
      '<div class="field"><label for="' + id + '">' + labelText + '</label>' + html + '</div>'

    const missionSelect = v.volontaireId
      ? missionsForVolontaireOptions(v.volontaireId, v.missionId)
      : missionOptions(v.missionId)

    return (
      '<form id="form-point">' +
      '<div class="form-row">' +
      field('volontaireId', 'Volontaire', '<select class="select" id="volontaireId" name="volontaireId" required>' + volontaireOptions(v.volontaireId) + '</select>') +
      field('missionId', 'Mission', '<select class="select" id="missionId" name="missionId">' + missionSelect + '</select>') +
      '</div>' +
      '<div class="form-row">' +
      field('date', 'Date', '<input class="input" type="date" id="date" name="date" value="' + escapeAttr(v.date || '') + '" required>') +
      field('type', 'Type', '<select class="select" id="type" name="type">' + options('suiviType', v.type || 'PointDeSuivi') + '</select>') +
      '</div>' +
      '<div class="form-row">' +
      field('status', 'Statut', '<select class="select" id="status" name="status">' + options('suiviStatus', v.status || 'Planned') + '</select>') +
      field('dueDate', 'Prochaine échéance', '<input class="input" type="date" id="dueDate" name="dueDate" value="' + escapeAttr(v.dueDate || '') + '">') +
      '</div>' +
      field('synthesis', 'Synthèse', '<textarea class="textarea" id="synthesis" name="synthesis" rows="3">' + escapeHtml(v.synthesis || '') + '</textarea>') +
      field('privateSynthesis', 'Synthèse privée', '<textarea class="textarea" id="privateSynthesis" name="privateSynthesis" rows="3">' + escapeHtml(v.privateSynthesis || '') + '</textarea>') +
      '<div class="detail-panel__footer">' +
      '<button type="button" class="btn btn--secondary" data-act="close">Annuler</button>' +
      '<button type="submit" class="btn btn--primary">Enregistrer</button>' +
      '</div>' +
      '</form>'
    )
  }

  // ----- Document -----
  function documentForm(d) {
    d = d || {}
    const field = (id, labelText, html) =>
      '<div class="field"><label for="' + id + '">' + labelText + '</label>' + html + '</div>'

    const fileInfo = d.fileData
      ? '<div class="file-info">Fichier actuel : ' + escapeHtml(d.fileName || 'document') + ' (' + formatFileSize(d.fileSize || 0) + ')</div>'
      : ''

    return (
      '<form id="form-document">' +
      field('name', 'Nom du document', '<input class="input" id="name" name="name" value="' + escapeAttr(d.name || '') + '" required>') +
      '<div class="form-row">' +
      field('type', 'Type', '<select class="select" id="type" name="type">' + options('documentType', d.type || 'Convention') + '</select>') +
      field('volontaireId', 'Volontaire', '<select class="select" id="volontaireId" name="volontaireId">' + volontaireOptions(d.volontaireId) + '</select>') +
      '</div>' +
      field('missionId', 'Mission', '<select class="select" id="missionId" name="missionId">' + missionOptions(d.missionId) + '</select>') +
      field('file', 'Fichier', '<input class="input" type="file" id="file" name="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt">' + fileInfo) +
      field('confidential', 'Confidentiel', '<label class="field"><input type="checkbox" id="confidential" name="confidential" ' + (d.confidential ? 'checked' : '') + '> Oui</label>') +
      '<div class="detail-panel__footer">' +
      '<button type="button" class="btn btn--secondary" data-act="close">Annuler</button>' +
      '<button type="submit" class="btn btn--primary">Enregistrer</button>' +
      '</div>' +
      '</form>'
    )
  }

  // ----- Formation -----
  function formationForm(f) {
    f = f || {}
    const field = (id, labelText, html) =>
      '<div class="field"><label for="' + id + '">' + labelText + '</label>' + html + '</div>'

    const missionSelect = f.volontaireId
      ? missionsForVolontaireOptions(f.volontaireId, f.missionId)
      : missionOptions(f.missionId)

    return (
      '<form id="form-formation">' +
      '<div class="form-row">' +
      field('volontaireId', 'Volontaire', '<select class="select" id="volontaireId" name="volontaireId" required>' + volontaireOptions(f.volontaireId) + '</select>') +
      field('missionId', 'Mission', '<select class="select" id="missionId" name="missionId">' + missionSelect + '</select>') +
      '</div>' +
      field('title', 'Intitulé de la formation', '<input class="input" id="title" name="title" value="' + escapeAttr(f.title || '') + '" required>') +
      '<div class="form-row">' +
      field('type', 'Type', '<select class="select" id="type" name="type">' + options('formationType', f.type || 'Civique') + '</select>') +
      field('organisme', 'Organisme', '<input class="input" id="organisme" name="organisme" value="' + escapeAttr(f.organisme || '') + '">') +
      '</div>' +
      '<div class="form-row">' +
      field('date', 'Date', '<input class="input" type="date" id="date" name="date" value="' + escapeAttr(f.date || '') + '">') +
      field('status', 'Statut', '<select class="select" id="status" name="status">' + options('formationStatus', f.status || 'Done') + '</select>') +
      '</div>' +
      field('notes', 'Notes', '<textarea class="textarea" id="notes" name="notes" rows="3">' + escapeHtml(f.notes || '') + '</textarea>') +
      '<div class="detail-panel__footer">' +
      '<button type="button" class="btn btn--secondary" data-act="close">Annuler</button>' +
      '<button type="submit" class="btn btn--primary">Enregistrer</button>' +
      '</div>' +
      '</form>'
    )
  }

  // ----- Générateurs d'options -----
  function options(enumKey, selected) {
    return OPTIONS[enumKey]
      .map(o => '<option value="' + o + '"' + (o === selected ? ' selected' : '') + '>' + label(enumKey, o) + '</option>')
      .join('')
  }

  function volontaireOptions(selected) {
    return (
      '<option value="">—</option>' +
      db.volontaires
        .map(v => '<option value="' + v.id + '"' + (v.id === selected ? ' selected' : '') + '>' + escapeHtml(v.lastName + ' ' + v.firstName) + '</option>')
        .join('')
    )
  }

  function missionOptions(selected) {
    return (
      '<option value="">—</option>' +
      db.missions
        .map(m => '<option value="' + m.id + '"' + (m.id === selected ? ' selected' : '') + '>' + escapeHtml(m.title) + '</option>')
        .join('')
    )
  }

  function missionsForVolontaireOptions(volontaireId, selected) {
    const list = db.missions.filter(m => m.volontaireId === volontaireId)
    return (
      '<option value="">—</option>' +
      list.map(m => '<option value="' + m.id + '"' + (m.id === selected ? ' selected' : '') + '>' + escapeHtml(m.title) + '</option>').join('')
    )
  }

  // ==================================================================
  // Binding des actions sur les formulaires
  // ==================================================================
  function bindForm(type, existing) {
    const form = $('#form-' + type)
    if (!form) return
    form.addEventListener('submit', e => {
      e.preventDefault()
      const data = new FormData(form)
      const isVolontaire = type === 'volontaire'
      const isMission = type === 'mission'
      const isFormation = type === 'formation'
      const isPoint = type === 'point'
      const isDocument = type === 'document'

      const record = {
        firstName: data.get('firstName'),
        lastName: data.get('lastName'),
        email: data.get('email'),
        phone: data.get('phone'),
        city: data.get('city'),
        zipcode: data.get('zipcode'),
        gender: data.get('gender'),
        birthDate: data.get('birthDate'),
        activityStatus: data.get('activityStatus'),
        studyLevel: data.get('studyLevel'),
        dateDebutVolontariat: data.get('dateDebutVolontariat'),
        dateFinVolontariat: data.get('dateFinVolontariat'),
        hoursPerWeek: toNum(data.get('hoursPerWeek')),
        monthlyIndemnite: toNum(data.get('monthlyIndemnite')),
        status: data.get('status'),
        additionalInformation: data.get('additionalInformation')
      }

      if (isVolontaire) {
        if (existing) {
          Object.assign(existing, record)
        } else {
          db.volontaires.push({
            id: uid('vol'),
            fileNumber: nextVolontaireNumber(loadStructure()),
            createdAt: today(),
            ...record
          })
        }
      } else if (isMission) {
        const mrec = {
          title: data.get('title'),
          domain: data.get('domain'),
          hostStructure: data.get('hostStructure'),
          hostCity: data.get('hostCity'),
          dateDebut: data.get('dateDebut'),
          dateFinPrevision: data.get('dateFinPrevision'),
          status: data.get('status'),
          description: data.get('description'),
          volontaireId: data.get('volontaireId')
        }
        if (existing) Object.assign(existing, mrec)
        else db.missions.push({ id: uid('mis'), createdAt: today(), ...mrec })
      } else if (isFormation) {
        const frec = {
          title: data.get('title'),
          type: data.get('type'),
          organisme: data.get('organisme') || null,
          date: data.get('date') || null,
          status: data.get('status'),
          notes: data.get('notes'),
          volontaireId: data.get('volontaireId'),
          missionId: data.get('missionId') || null
        }
        if (existing) Object.assign(existing, frec)
        else db.formations.push({ id: uid('form'), createdAt: today(), ...frec })
      } else if (isPoint) {
        const prec = {
          volontaireId: data.get('volontaireId'),
          missionId: data.get('missionId') || null,
          date: data.get('date'),
          type: data.get('type'),
          status: data.get('status'),
          dueDate: data.get('dueDate') || null,
          synthesis: data.get('synthesis'),
          privateSynthesis: data.get('privateSynthesis')
        }
        if (existing) {
          // Historique : avant d'écraser, on mémorise la version précédente
          existing.history = existing.history || []
          existing.history.push({
            savedAt: new Date().toISOString(),
            date: existing.date,
            dueDate: existing.dueDate,
            status: existing.status,
            synthesis: existing.synthesis || '',
            privateSynthesis: existing.privateSynthesis || ''
          })
          Object.assign(existing, prec)
        } else {
          db.pointsSuivi.push({ id: uid('pt'), createdAt: today(), history: [], ...prec })
        }
      } else if (isDocument) {
        const fileInput = form.querySelector('#file')
        const file = fileInput && fileInput.files && fileInput.files[0]

        const saveDocument = (fileData, fileName, fileSize) => {
          const drec = {
            name: data.get('name'),
            type: data.get('type'),
            volontaireId: data.get('volontaireId') || null,
            missionId: data.get('missionId') || null,
            confidential: data.get('confidential') === 'on' || data.get('confidential') === 'true',
            fileData: fileData,
            fileName: fileName,
            fileSize: fileSize
          }
          if (existing) {
            Object.assign(existing, drec)
          } else {
            db.documents.push({ id: uid('doc'), createdAt: today(), ...drec })
          }
          commit()
          closeModal()
          toast('Enregistré ✔')
        }

        if (file) {
          if (file.size > 2 * 1024 * 1024) {
            toast('Fichier trop volumineux (max 2 Mo recommandé pour localStorage)')
            return
          }
          const reader = new FileReader()
          reader.onload = function (e) {
            saveDocument(e.target.result, file.name, file.size)
          }
          reader.onerror = function () {
            toast('Erreur de lecture du fichier')
          }
          reader.readAsDataURL(file)
        } else {
          saveDocument(existing ? existing.fileData : null, existing ? existing.fileName : null, existing ? existing.fileSize : null)
        }
        return
      }

      commit()
      closeModal()
      toast('Enregistré ✔')
    })
  }

  // ------------------------------------------------------------------
  // Actions génériques (view / edit / delete) — délégation d'événements
  // ------------------------------------------------------------------
  function bindTableActions() {
    document.body.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]')
      if (!btn) return
      const act = btn.dataset.act
      const id = btn.dataset.id

      // Detect the source view via the closest section
      const section = btn.closest('section')
      const view = section ? section.id.replace('view-', '') : null

      if (act === 'close') {
        closeModal()
        return
      }

      switch (view) {
        case 'dashboard':
          if (act === 'fill') openPointEdit(id, true)
          break
        case 'volontaires':
          if (act === 'view') showVolontaireDetail(id)
          else if (act === 'edit') openVolontaireEdit(id)
          else if (act === 'delete') confirmDelete('volontaires', id)
          break
        case 'missions':
          if (act === 'view') showMissionDetail(id)
          else if (act === 'edit') openMissionEdit(id)
          else if (act === 'delete') confirmDelete('missions', id)
          break
        case 'formations':
          if (act === 'view') showFormationDetail(id)
          else if (act === 'edit') openFormationEdit(id)
          else if (act === 'delete') confirmDelete('formations', id)
          break
        case 'points':
          if (act === 'view') showPointDetail(id)
          else if (act === 'edit') openPointEdit(id)
          else if (act === 'delete') confirmDelete('pointsSuivi', id)
          break
        case 'conges':
          if (act === 'delete') deleteCongePeriod(id, btn.dataset.start, btn.dataset.end)
          break
        case 'documents':
          if (act === 'view') showDocumentDetail(id)
          else if (act === 'edit') openDocumentEdit(id)
          else if (act === 'delete') confirmDelete('documents', id)
          else if (act === 'download') downloadDocument(id)
          break
      }
    })
  }

  // Open edit modals
  function openVolontaireEdit(id) {
    const v = getVolontaire(id)
    if (!v) return
    openModal('Modifier le volontaire', volontaireForm(v))
    bindForm('volontaire', v)
  }

  function openMissionEdit(id) {
    const m = getMission(id)
    if (!m) return
    openModal('Modifier la mission', missionForm(m))
    bindForm('mission', m)
  }

  function openFormationEdit(id) {
    const f = db.formations.find(x => x.id === id)
    if (!f) return
    openModal('Modifier la formation', formationForm(f))
    bindForm('formation', f)
  }

  function openPointEdit(id, fillDefaults) {
    const p = db.pointsSuivi.find(x => x.id === id)
    if (!p) return
    const defaults = fillDefaults
      ? { date: today(), dueDate: nextMonthIso(today()) }
      : null
    openModal('Modifier le point de suivi', pointForm(p, defaults))
    bindForm('point', p)
  }

  function openDocumentEdit(id) {
    const d = db.documents.find(x => x.id === id)
    if (!d) return
    openModal('Modifier le document', documentForm(d))
    bindForm('document', d)
  }

  // Create modals
  function openVolontaireCreate() {
    openModal('Nouveau volontaire', volontaireForm())
    bindForm('volontaire', null)
  }

  function openMissionCreate() {
    openModal('Nouvelle mission', missionForm())
    bindForm('mission', null)
  }

  function openFormationCreate() {
    if (!db.volontaires.length) {
      toast('Ajoutez d\u2019abord un volontaire.')
      return
    }
    openModal('Nouvelle formation', formationForm())
    bindForm('formation', null)
  }

  function openPointCreate() {
    if (!db.volontaires.length) {
      toast('Ajoutez d\u2019abord un volontaire.')
      return
    }
    openModal('Nouveau point de suivi', pointForm())
    bindForm('point', null)
  }

  function openDocumentCreate() {
    openModal('Nouveau document', documentForm())
    bindForm('document', null)
  }

  // ------------------------------------------------------------------
  // Confirmation de suppression
  // ------------------------------------------------------------------
  function confirmDelete(collectionKey, id) {
    const labelsMap = {
      volontaires: 'ce volontaire',
      missions: 'cette mission',
      formations: 'cette formation',
      pointsSuivi: 'ce point de suivi',
      documents: 'ce document'
    }
    const itemLabel = labelsMap[collectionKey] || 'cet élément'
    openConfirm(
      'Supprimer',
      'Voulez-vous vraiment supprimer ' + itemLabel + ' ? Cette action est irréversible.',
      () => {
        db[collectionKey] = db[collectionKey].filter(x => x.id !== id)
        // Lors du retrait d'un volontaire, nettoyer les références
        if (collectionKey === 'volontaires') {
          db.pointsSuivi = db.pointsSuivi.filter(p => p.volontaireId !== id)
          db.documents = db.documents.filter(d => d.volontaireId !== id)
          db.formations = db.formations.filter(f => f.volontaireId !== id)
        }
        if (collectionKey === 'missions') {
          db.pointsSuivi = db.pointsSuivi.map(p =>
            p.missionId === id ? { ...p, missionId: null } : p
          )
          db.formations = db.formations.map(f =>
            f.missionId === id ? { ...f, missionId: null } : f
          )
        }
        commit()
        closeModal()
        toast('Supprimé ✔')
      }
    )
  }

  function openConfirm(title, message, onConfirm) {
    const html =
      '<p>' + message + '</p>' +
      '<div class="detail-panel__footer">' +
      '<button type="button" class="btn btn--secondary" data-act="close">Annuler</button>' +
      '<button type="button" class="btn btn--danger" id="confirm-ok">Supprimer</button>' +
      '</div>'
    openModal(title, html)
    $('#confirm-ok').addEventListener('click', onConfirm)
  }

  // ------------------------------------------------------------------
  // Boutons d'ajout (barre de la vue)
  // ------------------------------------------------------------------
  function bindCreateButtons() {
    $('#btn-volontaire-add').addEventListener('click', openVolontaireCreate)
    $('#btn-mission-add').addEventListener('click', openMissionCreate)
    $('#btn-formation-add').addEventListener('click', openFormationCreate)
    $('#btn-point-add').addEventListener('click', openPointCreate)
    $('#btn-document-add').addEventListener('click', openDocumentCreate)
    $('#btn-export-csv').addEventListener('click', exportCSV)
    $('#detail-panel-close').addEventListener('click', closeModal)

    $('#btn-reset').addEventListener('click', () => {
      openConfirm(
        'Réinitialiser',
        'Réinitialiser les données de démonstration ? Vos données actuelles seront remplacées.',
        () => {
          db = seedDemo()
          commit()
          closeModal()
          toast('Données réinitialisées ✔')
        }
      )
    })

    // Recherche volontaires
    $('#volontaires-search').addEventListener('input', renderVolontaires)
  }

  // ------------------------------------------------------------------
  // Divers
  // ------------------------------------------------------------------
  function today() {
    return new Date().toISOString().slice(0, 10)
  }

  // Prochain jour (par défaut +1 mois) à partir d'une date ISO 'YYYY-MM-DD'
  function nextMonthIso(isoStr, months) {
    months = months || 1
    const d = new Date(isoStr + 'T00:00:00')
    const day = d.getDate()
    d.setDate(1)
    d.setMonth(d.getMonth() + months)
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(day, lastDay))
    return d.toISOString().slice(0, 10)
  }

  function toNum(v) {
    const n = parseFloat(v)
    return isNaN(n) ? null : n
  }

  function formatDateTime(isoStr) {
    if (!isoStr) return '—'
    const d = new Date(isoStr)
    if (isNaN(d.getTime())) return isoStr
    return (
      d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' à ' +
      d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    )
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, '&#39;')
  }

  // Export des données au format CSV (séparateur ; pour Excel FR)
  function exportCSV() {
    const csvRows = []
    csvRows.push(['Type', 'Libellé', 'Lié à', 'Statut', 'Date', 'Détail'])
    db.volontaires.forEach(v =>
      csvRows.push(['Volontaire', v.lastName + ' ' + v.firstName, v.city || '', label('volontaireStatus', v.status), v.dateDebutVolontariat || '', v.email || ''])
    )
    db.missions.forEach(m =>
      csvRows.push(['Mission', m.title, volontaireName(m.volontaireId), label('missionStatus', m.status), m.dateDebut || '', m.domain || ''])
    )
    db.formations.forEach(f =>
      csvRows.push(['Formation', f.title, volontaireName(f.volontaireId), label('formationStatus', f.status), f.date || '', f.organisme || ''])
    )
    db.pointsSuivi.forEach(p =>
      csvRows.push(['Point de suivi', formatDate(p.date), volontaireName(p.volontaireId), label('suiviStatus', p.status), p.date || '', p.synthesis || ''])
    )
    db.documents.forEach(d =>
      csvRows.push(['Document', d.name, volontaireName(d.volontaireId), label('documentType', d.type), d.createdAt || '', d.confidential ? 'Confidentiel' : ''])
    )

    const csv = csvRows
      .map(row =>
        row
          .map(cell => {
            const s = String(cell == null ? '' : cell)
            return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
          })
          .join(';')
      )
      .join('\r\n')

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'rapports-services-civiques.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast('Export CSV généré ✔')
  }

  let toastTimer = null
  function toast(message) {
    toastEl.textContent = message
    toastEl.hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => (toastEl.hidden = true), 2600)
  }

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------
  function init() {
    // Amorce les données de démo au premier lancement
    if (!store.get(DB_KEY)) {
      db = seedDemo()
      saveData(db)
    }
    bindNavigation()
    bindCreateButtons()
    bindTableActions()
    bindCongesControls()
    renderAll()
  }

  document.addEventListener('DOMContentLoaded', init)
})()