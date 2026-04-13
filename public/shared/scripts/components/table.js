/**
 * Generic, instantiable data table with multi-column sort, pagination, and filters.
 *
 * Column definition:
 *   key       {string}    row property key
 *   label     {string}    header text
 *   render?   {(val, row) => string}  custom cell renderer (returns text, not HTML)
 *   sort?     {(a, b) => number}      custom value comparator
 *   title?    {(val, row) => string}  tooltip for the <td>
 *   className?{string}   CSS class applied to both <th> and <td>
 *
 * Filter definition:
 *   id          {string}
 *   label       {string}
 *   type        {'chips'|'search'}
 *   key?        {string}    row property key (chips; also default for search)
 *   order?      {string[]}  preferred chip order
 *   match?      {(row, query) => boolean}  custom match fn (search)
 *   placeholder?{string}   input placeholder (search)
 */
import SearchFilter from './search-filter.js';

export default class Table {

    /**
     * @param {HTMLElement} el
     * @param {Array<{key: string, label: string, render?: function, sort?: function, title?: function, className?: string}>} columns
     * @param {{pageSize?: number, filters?: Array}} options
     */
    constructor(el, columns, {pageSize = 100, filters = []} = {}) {
        this._el = el;
        this._columns = columns;
        this._pageSize = pageSize;
        this._filterSpecs = filters;
        this._filterPredicates = new Map();
        this._rows = [];
        this._sortSpec = [];
        this._page = 0;
        this._build();
    }

    /** Replace the displayed rows. Resets filters and page; rebuilds chip values. */
    setRows(rows) {
        this._rows = rows;
        this._filterPredicates = new Map();
        this._page = 0;
        this._buildFilterBar();
        this._renderAll();
    }

    /**
     * Set sort programmatically — supports multi-column.
     * @param {Array<{key: string, dir: 1|-1}>} spec
     */
    setSort(spec) {
        this._sortSpec = spec;
        this._page = 0;
        this._updateSortIndicators();
        this._renderAll();
    }

    // --- private: build ---

    _build() {
        if (this._filterSpecs.length) {
            this._filtersEl = document.createElement('div');
            this._filtersEl.className = 'table-filters';
            this._el.appendChild(this._filtersEl);
        }

        this._wrapper = document.createElement('div');
        this._wrapper.className = 'table-wrapper';

        this._table = document.createElement('table');
        this._table.className = 'data-table';
        this._thead = document.createElement('thead');
        this._tbody = document.createElement('tbody');
        this._table.append(this._thead, this._tbody);
        this._wrapper.appendChild(this._table);

        this._pagination = document.createElement('div');
        this._pagination.className = 'table-pagination';
        this._wrapper.appendChild(this._pagination);

        this._el.appendChild(this._wrapper);
        this._renderHead();
    }

    // --- private: filters ---

    _buildFilterBar() {
        if (!this._filtersEl) return;
        this._filtersEl.innerHTML = '';

        for (const spec of this._filterSpecs) {
            const groupEl = document.createElement('div');
            groupEl.className = 'filter-group';

            const labelEl = document.createElement('div');
            labelEl.className = 'filter-group-label';
            labelEl.textContent = spec.label;
            groupEl.appendChild(labelEl);

            if (spec.type === 'search') {
                new SearchFilter(groupEl, {
                    placeholder: spec.placeholder,
                    onChange: (query) => {
                        const q = query.trim();
                        const pred = q
                            ? (row) => spec.match
                                ? spec.match(row, q)
                                : String(row[spec.key] ?? '').toLowerCase().includes(q.toLowerCase())
                            : null;
                        this._setFilter(spec.id, pred);
                    },
                });
            } else {
                const values = this._uniqueValues(this._rows, spec.key, spec.order);
                if (values.length < 2) continue;

                const chipsEl = document.createElement('div');
                chipsEl.className = 'filter-chips';

                const active = new Set();
                for (const val of values) {
                    const btn = document.createElement('button');
                    btn.className = 'filter-chip';
                    btn.textContent = val;
                    btn.addEventListener('click', () => {
                        active.has(val) ? active.delete(val) : active.add(val);
                        btn.classList.toggle('active', active.has(val));
                        this._setFilter(spec.id, active.size ? (row) => active.has(row[spec.key]) : null);
                    });
                    chipsEl.appendChild(btn);
                }

                groupEl.appendChild(chipsEl);
            }

            this._filtersEl.appendChild(groupEl);
        }
    }

    _setFilter(id, predicate) {
        if (predicate) {
            this._filterPredicates.set(id, predicate);
        } else {
            this._filterPredicates.delete(id);
        }
        this._page = 0;
        this._renderAll();
    }

    _filteredRows() {
        let rows = this._rows;
        for (const pred of this._filterPredicates.values()) {
            rows = rows.filter(pred);
        }
        return rows;
    }

    _uniqueValues(rows, key, order = []) {
        const seen = new Set(rows.map(r => r[key]).filter(Boolean));
        const result = order.filter(v => seen.has(v));
        for (const v of [...seen].sort()) {
            if (!result.includes(v)) result.push(v);
        }
        return result;
    }

    // --- private: rendering ---

    _renderHead() {
        const tr = document.createElement('tr');
        for (const col of this._columns) {
            const th = document.createElement('th');
            th.textContent = col.label;
            th.dataset.key = col.key;
            if (col.className) th.className = col.className;
            th.addEventListener('click', () => this._onHeaderClick(col.key));
            tr.appendChild(th);
        }
        this._thead.appendChild(tr);
    }

    _renderAll() {
        const filtered = this._filteredRows();
        const sorted   = this._sortedRows(filtered);
        const start    = this._page * this._pageSize;
        const page     = sorted.slice(start, start + this._pageSize);

        this._tbody.innerHTML = '';
        for (const row of page) {
            const tr = document.createElement('tr');
            for (const col of this._columns) {
                const td = document.createElement('td');
                const val = row[col.key] ?? '';
                td.textContent = col.render ? col.render(val, row) : val;
                if (col.title) td.title = col.title(val, row);
                if (col.className) td.className = col.className;
                tr.appendChild(td);
            }
            this._tbody.appendChild(tr);
        }

        const total     = filtered.length;
        const pageCount = Math.max(1, Math.ceil(total / this._pageSize));

        if (pageCount <= 1) {
            this._pagination.hidden = true;
            return;
        }

        const end  = Math.min((this._page + 1) * this._pageSize, total);
        const prev = document.createElement('button');
        prev.textContent = '←';
        prev.className = 'page-btn';
        prev.disabled = this._page === 0;
        prev.addEventListener('click', () => this._goToPage(this._page - 1));

        const info = document.createElement('span');
        info.className = 'page-info';
        info.textContent = `page ${this._page + 1} of ${pageCount}  ·  ${start + 1}–${end} of ${total}`;

        const next = document.createElement('button');
        next.textContent = '→';
        next.className = 'page-btn';
        next.disabled = this._page >= pageCount - 1;
        next.addEventListener('click', () => this._goToPage(this._page + 1));

        this._pagination.hidden = false;
        this._pagination.replaceChildren(prev, info, next);
    }

    // --- private: sort ---

    _onHeaderClick(key) {
        const existing = this._sortSpec.find(s => s.key === key);
        this._sortSpec = [{key, dir: existing ? -existing.dir : 1}];
        this._page = 0;
        this._updateSortIndicators();
        this._renderAll();
    }

    _sortedRows(rows) {
        if (!this._sortSpec.length) return rows;
        return [...rows].sort((a, b) => {
            for (const {key, dir} of this._sortSpec) {
                const col = this._columns.find(c => c.key === key);
                const va = a[key] ?? '';
                const vb = b[key] ?? '';
                const cmp = col?.sort
                    ? col.sort(va, vb)
                    : String(va).localeCompare(String(vb), undefined, {numeric: true});
                if (cmp !== 0) return cmp * dir;
            }
            return 0;
        });
    }

    _updateSortIndicators() {
        const specMap = new Map(this._sortSpec.map(s => [s.key, s.dir]));
        for (const th of this._thead.querySelectorAll('th')) {
            const dir = specMap.get(th.dataset.key);
            th.classList.toggle('sort-asc',  dir === 1);
            th.classList.toggle('sort-desc', dir === -1);
        }
    }

    // --- private: pagination ---

    _goToPage(page) {
        const pageCount = Math.ceil(this._filteredRows().length / this._pageSize);
        this._page = Math.max(0, Math.min(page, pageCount - 1));
        this._renderAll();
        this._el.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
}
