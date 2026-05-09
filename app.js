
const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Crect width='320' height='180' fill='%23282828'/%3E%3Crect x='130' y='72' width='60' height='45' rx='4' fill='%23383838'/%3E%3Cpolygon points='125,72 160,48 195,72' fill='%23383838'/%3E%3Crect x='148' y='87' width='24' height='30' rx='3' fill='%23282828'/%3E%3Crect x='143' y='48' width='6' height='26' fill='%23383838'/%3E%3Crect x='139' y='48' width='14' height='7' rx='1' fill='%23383838'/%3E%3C/svg%3E";

// ── CSV parser (RFC 4180) ─────────────────────────────────────────────────────
function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else {
                field += c;
            }
        } else {
            if      (c === '"')  { inQuotes = true; }
            else if (c === ',')  { row.push(field); field = ''; }
            else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
            else if (c === '\r') { /* skip */ }
            else                 { field += c; }
        }
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
}

function csvToObjects(text) {
    const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text; // strip BOM
    const rows = parseCSV(clean);
    const headers = rows[0];
    return rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
        return obj;
    });
}

// ── Card builder ──────────────────────────────────────────────────────────────
function createCard(row) {
    const wrapper = document.createElement('div');
    wrapper.className        = 'card-description';
    wrapper.dataset.title    = row.title                  || '';
    wrapper.dataset.img      = row.Image                  || '';
    wrapper.dataset.day      = row['Meeting Day']         || '';
    wrapper.dataset.time     = row['Time Group Starts']   || '';
    wrapper.dataset.area     = row.AreaOfTown             || '';
    wrapper.dataset.leader   = row.Leader                 || '';
    wrapper.dataset.type     = row.Type                   || '';
    wrapper.dataset.url      = row.JoinURL                || '#';
    wrapper.dataset.section  = row.section                || '';

    const link = document.createElement('a');
    link.addEventListener('click', () => openForm(wrapper));

    const article = document.createElement('article');
    article.className = 'card';

    const imgWrap = document.createElement('div');
    imgWrap.setAttribute('style', 'width:100%;height:100%;border:1px');

    const img = document.createElement('img');
    img.src     = row.Image || row.image || PLACEHOLDER;
    img.onerror = () => { img.src = PLACEHOLDER; };
    img.setAttribute('style', 'object-fit:fill;width:98%;');

    const overlay = document.createElement('div');
    overlay.className = 'card-overlay';

    imgWrap.appendChild(img);
    article.appendChild(imgWrap);
    article.appendChild(overlay);
    link.appendChild(article);

    const titleDiv = document.createElement('div');
    titleDiv.className = 'card-title';
    titleDiv.textContent = (row.title || '').trim();
    link.appendChild(titleDiv);

    const descDiv = document.createElement('div');
    descDiv.className = 'card-desc-text';
    descDiv.hidden    = true;
    descDiv.innerHTML = row.Description || '';

    wrapper.appendChild(link);
    wrapper.appendChild(descDiv);
    return wrapper;
}

// ── Section builder ───────────────────────────────────────────────────────────
function createSection(sectionName) {
    const h2 = document.createElement('h2');
    h2.className   = 'row-title';
    h2.textContent = sectionName;

    const scroll = document.createElement('div');
    scroll.className          = 'row-scroll';
    scroll.dataset.section    = sectionName;

    const section = document.createElement('section');
    section.className = 'row';
    section.appendChild(scroll);

    return { h2, section, scroll };
}

// ── Load sections + cards from both CSVs ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    Promise.all([
        fetch('GroupTypes.csv?v=20260509').then(r => r.text()),
        fetch('groups.csv?v=20260509').then(r => r.text())
    ])
    .then(([typesCsv, groupsCsv]) => {
        const container = document.getElementById('groups-container');

        // Section order and names come from GroupTypes.csv
        const typeObjects  = csvToObjects(typesCsv).filter(r => r.GroupType);
        const sectionOrder = typeObjects.map(r => r.GroupType);

        // Build index → section name map from GroupTypes.csv Index column
        const indexToSection = {};
        typeObjects.forEach(r => {
            if (r.Index) indexToSection[String(r.Index).trim()] = r.GroupType;
        });

        const records = csvToObjects(groupsCsv);

        // Group cards by section: use GroupTypes indices if present, else fall back to section column
        const bySection = {};
        sectionOrder.forEach(name => { bySection[name.toLowerCase()] = []; });

        records.forEach(row => {
            const typesField = (row.GroupTypes || '').trim();
            if (typesField) {
                typesField.split(',').map(s => s.trim()).filter(Boolean).forEach(idx => {
                    const sectionName = indexToSection[idx];
                    if (sectionName) bySection[sectionName.toLowerCase()].push(row);
                });
            } else {
                const key = (row.section || '').toLowerCase();
                if (bySection[key] !== undefined) bySection[key].push(row);
            }
        });

        sectionOrder.forEach(name => {
            const { h2, section, scroll } = createSection(name);
            (bySection[name.toLowerCase()] || []).forEach(row => {
                const card = createCard(row);
                card.dataset.section = name.toLowerCase();
                scroll.appendChild(card);
            });
            container.appendChild(h2);
            container.appendChild(section);
        });

        buildFilterUI(records, sectionOrder);
        updateFilterCount();
    })
    .catch(err => console.error('Failed to load CSV data:', err));
});

// ── Popup ─────────────────────────────────────────────────────────────────────
function openForm(cardEl) {
    const popupOverlay  = document.getElementById('popupOverlay');
    const formContainer = document.getElementById('formContainer');

    const title  = cardEl.dataset.title  || '';
    const day    = cardEl.dataset.day    || '';
    const time   = cardEl.dataset.time   || '';
    const area   = cardEl.dataset.area   || '';
    const leader = cardEl.dataset.leader || '';
    const type   = cardEl.dataset.type   || '';
    const url    = cardEl.dataset.url    || '#';
    const descEl = cardEl.querySelector('.card-desc-text');
    const desc   = descEl ? descEl.innerHTML : '';

    const img = cardEl.dataset.img || '';
    formContainer.innerHTML = `
        ${img ? `<img class="popup-header-img" src="${img}" alt="" onerror="this.style.display='none'">` : ''}
        <div class="form-container">
            <h2>${title}</h2>
            <div class="popup-meta">
                <div class="popup-meta-item">
                    <span class="popup-meta-label">Meeting Day</span>
                    <span class="popup-meta-value">${day || '—'}</span>
                </div>
                <div class="popup-meta-item">
                    <span class="popup-meta-label">Meeting Time</span>
                    <span class="popup-meta-value">${time || '—'}</span>
                </div>
                <div class="popup-meta-item">
                    <span class="popup-meta-label">Area of Town</span>
                    <span class="popup-meta-value">${area || '—'}</span>
                </div>
                <div class="popup-meta-item">
                    <span class="popup-meta-label">Type</span>
                    <span class="popup-meta-value">${type || '—'}</span>
                </div>
                <div class="popup-meta-item">
                    <span class="popup-meta-label">Leader</span>
                    <span class="popup-meta-value">${leader || '—'}</span>
                </div>
            </div>
            ${desc ? `<div class="popup-desc">${desc}</div>` : ''}
            <div class="button-container">
                <a href="${url}" target="_blank" class="button-link">Join Group</a>
                <button type="button" class="popup-close-btn" onclick="closeForm()">Close</button>
            </div>
        </div>
    `;

    popupOverlay.style.display = 'flex';
}

function closeForm() {
    document.getElementById('popupOverlay').style.display = 'none';
    document.getElementById('formContainer').innerHTML = '';
}

// ── Filter ────────────────────────────────────────────────────────────────────
const activeFilters = { day: new Set(), section: '', leader: '' };

function buildFilterUI(records, sectionOrder) {
    const unique = key => [...new Set(records.map(r => r[key]).filter(Boolean))].sort();
    populateChips('filter-day', unique('Meeting Day'), 'day');
    populateGroupTypeSelect(sectionOrder || unique('section'));
    populateLeaderSearch(unique('Leader'));
    updateFilterCount();
}

function populateChips(containerId, values, filterKey) {
    const container = document.getElementById(containerId);
    values.forEach(val => {
        const chip = document.createElement('span');
        chip.className   = 'filter-chip';
        chip.textContent = val;
        chip.addEventListener('click', () => {
            const key = val.toLowerCase();
            if (activeFilters[filterKey].has(key)) {
                activeFilters[filterKey].delete(key);
                chip.classList.remove('active');
            } else {
                activeFilters[filterKey].add(key);
                chip.classList.add('active');
            }
            applyFilters();
            updateFilterBadge();
            updateFilterCount();
        });
        container.appendChild(chip);
    });
}

function populateGroupTypeSelect(values) {
    const select = document.getElementById('filter-section');
    values.forEach(val => {
        const opt = document.createElement('option');
        opt.value       = val;
        opt.textContent = val;
        select.appendChild(opt);
    });
    select.addEventListener('change', () => {
        activeFilters.section = select.value ? select.value.toLowerCase() : '';
        applyFilters();
        updateFilterBadge();
        updateFilterCount();
    });
}

function populateLeaderSearch(values) {
    const input    = document.getElementById('filter-leader-input');
    const dropdown = document.getElementById('filter-leader-dropdown');
    const clearBtn = document.getElementById('filter-leader-clear');

    function renderOptions(query) {
        const q = query.toLowerCase();
        dropdown.innerHTML = '';
        const filtered = q ? values.filter(v => v.toLowerCase().includes(q)) : values;
        filtered.forEach(val => {
            const opt = document.createElement('div');
            opt.className   = 'filter-search-option';
            opt.textContent = val;
            if (activeFilters.leader === val.toLowerCase()) opt.classList.add('selected');
            opt.addEventListener('mousedown', e => {
                e.preventDefault();
                activeFilters.leader  = val.toLowerCase();
                input.value           = val;
                clearBtn.style.display = 'block';
                dropdown.classList.remove('open');
                applyFilters();
                updateFilterBadge();
                updateFilterCount();
            });
            dropdown.appendChild(opt);
        });
        dropdown.classList.toggle('open', filtered.length > 0);
    }

    clearBtn.addEventListener('click', clearLeaderFilter);
    input.addEventListener('focus', () => renderOptions(input.value));
    input.addEventListener('input', () => renderOptions(input.value));
    input.addEventListener('blur',  () => setTimeout(() => dropdown.classList.remove('open'), 150));
}

function clearLeaderFilter() {
    activeFilters.leader = '';
    document.getElementById('filter-leader-input').value   = '';
    document.getElementById('filter-leader-clear').style.display = 'none';
    document.getElementById('filter-leader-dropdown').classList.remove('open');
    applyFilters();
    updateFilterBadge();
    updateFilterCount();
}

function applyFilters() {
    const { day, section, leader } = activeFilters;
    const noFilter = day.size === 0 && !section && !leader;

    document.querySelectorAll('.card-description').forEach(card => {
        const visible = noFilter || (
            (day.size === 0 || day.has((card.dataset.day     || '').toLowerCase())) &&
            (!section  || section === (card.dataset.section  || '').toLowerCase()) &&
            (!leader   || leader  === (card.dataset.leader   || '').toLowerCase())
        );
        card.style.display = visible ? '' : 'none';
    });

    // Hide sections where every card is filtered out
    document.querySelectorAll('section.row').forEach(sec => {
        const anyVisible = [...sec.querySelectorAll('.card-description')]
            .some(c => c.style.display !== 'none');
        sec.style.display = anyVisible ? '' : 'none';
        const h2 = sec.previousElementSibling;
        if (h2 && h2.classList.contains('row-title'))
            h2.style.display = anyVisible ? '' : 'none';
    });
}

function updateFilterBadge() {
    const total = activeFilters.day.size + (activeFilters.section ? 1 : 0) + (activeFilters.leader ? 1 : 0);
    const badge = document.getElementById('filter-badge');
    const btn   = document.getElementById('filterToggleBtn');
    badge.textContent   = total;
    badge.style.display = total > 0 ? 'inline-flex' : 'none';
    btn.classList.toggle('active', total > 0);
}

function updateFilterCount() {
    const total   = document.querySelectorAll('.card-description').length;
    const visible = [...document.querySelectorAll('.card-description')]
        .filter(c => c.style.display !== 'none').length;
    const anyActive = activeFilters.day.size > 0 || activeFilters.section || activeFilters.leader;
    document.getElementById('filter-count').textContent =
        anyActive ? `${visible} of ${total} groups` : `${total} groups`;
}

function clearFilters() {
    activeFilters.day.clear();
    activeFilters.section = '';
    activeFilters.leader  = '';
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    const sel = document.getElementById('filter-section');
    if (sel) sel.value = '';
    document.getElementById('filter-leader-input').value         = '';
    document.getElementById('filter-leader-clear').style.display = 'none';
    document.getElementById('filter-leader-dropdown').classList.remove('open');
    applyFilters();
    updateFilterBadge();
    updateFilterCount();
}

function openFilterModal() {
    document.getElementById('filterOverlay').style.display = 'flex';
}

function closeFilterModal() {
    document.getElementById('filterOverlay').style.display = 'none';
}

function handleFilterOverlayClick(e) {
    if (e.target === document.getElementById('filterOverlay')) closeFilterModal();
}
