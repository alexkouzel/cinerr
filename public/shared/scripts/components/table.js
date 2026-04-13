/**
 * Generic, instantiable data table with multi-column sort and pagination.
 *
 * Column definition:
 *   key       {string}    row property key
 *   label     {string}    header text
 *   render?   {(val, row) => string}  custom cell renderer (returns text, not HTML)
 *   sort?     {(a, b) => number}      custom value comparator
 *   title?    {(val, row) => string}  tooltip for the <td> (e.g. full path on truncated cell)
 *   className?{string}   CSS class applied to both <th> and <td>
 */
export default class Table {

    /**
     * @param {HTMLElement} el
     * @param {Array<{key: string, label: string, render?: function, sort?: function, className?: string}>} columns
     * @param {{pageSize?: number}} options
     */
    constructor(el, columns, {pageSize = 100} = {}) {
        this._el = el;
        this._columns = columns;
        this._pageSize = pageSize;
        this._rows = [];
        this._sortSpec = [];   // [{key, dir: 1|-1}, ...]
        this._page = 0;
        this._build();
    }

    /** Replace the displayed rows. Resets to page 0. */
    setRows(rows) {
        this._rows = rows;
        this._page = 0;
        this._renderBody();
        this._renderPagination();
    }

    /**
     * Set sort programmatically — supports multi-column.
     * @param {Array<{key: string, dir: 1|-1}>} spec
     */
    setSort(spec) {
        this._sortSpec = spec;
        this._page = 0;
        this._updateSortIndicators();
        this._renderBody();
        this._renderPagination();
    }

    // --- private: build ---

    _build() {
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

    _renderBody() {
        const sorted = this._sortedRows();
        const start = this._page * this._pageSize;
        const page = sorted.slice(start, start + this._pageSize);

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
    }

    _renderPagination() {
        const total = this._rows.length;
        const pageCount = Math.max(1, Math.ceil(total / this._pageSize));

        if (pageCount <= 1) {
            this._pagination.hidden = true;
            return;
        }

        this._pagination.hidden = false;

        const start = this._page * this._pageSize + 1;
        const end = Math.min((this._page + 1) * this._pageSize, total);

        const prev = document.createElement('button');
        prev.textContent = '←';
        prev.className = 'page-btn';
        prev.disabled = this._page === 0;
        prev.addEventListener('click', () => this._goToPage(this._page - 1));

        const info = document.createElement('span');
        info.className = 'page-info';
        info.textContent = `page ${this._page + 1} of ${pageCount}  ·  ${start}–${end} of ${total}`;

        const next = document.createElement('button');
        next.textContent = '→';
        next.className = 'page-btn';
        next.disabled = this._page >= pageCount - 1;
        next.addEventListener('click', () => this._goToPage(this._page + 1));

        this._pagination.replaceChildren(prev, info, next);
    }

    // --- private: sort ---

    _onHeaderClick(key) {
        const existing = this._sortSpec.find(s => s.key === key);
        if (existing) {
            this._sortSpec = [{key, dir: -existing.dir}];
        } else {
            this._sortSpec = [{key, dir: 1}];
        }
        this._page = 0;
        this._updateSortIndicators();
        this._renderBody();
        this._renderPagination();
    }

    _sortedRows() {
        if (!this._sortSpec.length) return this._rows;
        return [...this._rows].sort((a, b) => {
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
        const pageCount = Math.ceil(this._rows.length / this._pageSize);
        this._page = Math.max(0, Math.min(page, pageCount - 1));
        this._renderBody();
        this._renderPagination();
        this._el.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
}
