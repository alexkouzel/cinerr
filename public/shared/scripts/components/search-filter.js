import SearchBar from './search-bar.js';

export default class SearchFilter {

    /**
     * @param {HTMLElement} el
     * @param {{placeholder?: string, debounce?: number, onChange: (value: string) => void}} options
     */
    constructor(el, {placeholder = 'search...', debounce = 200, onChange}) {
        this._onChange = onChange;
        this._debounceMs = debounce;
        this._timer = null;
        this._bar = new SearchBar(el, {
            placeholder,
            onInput: (value) => {
                clearTimeout(this._timer);
                this._timer = setTimeout(() => this._onChange(value), this._debounceMs);
            },
        });
    }

    clear() {
        clearTimeout(this._timer);
        this._bar.clear();
    }
}
