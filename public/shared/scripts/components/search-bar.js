export default class SearchBar {

    /**
     * @param {HTMLElement} el
     * @param {{placeholder?: string, onInput: (value: string) => void}} options
     */
    constructor(el, {placeholder = 'search...', onInput}) {
        this._onInput = onInput;
        this._build(el, placeholder);
    }

    getValue() {
        return this._input.value;
    }

    clear() {
        this._input.value = '';
        this._onInput('');
    }

    // --- private ---

    _build(el, placeholder) {
        const wrapper = document.createElement('div');
        wrapper.className = 'search-bar';

        this._input = document.createElement('input');
        this._input.type = 'text';
        this._input.className = 'search-input';
        this._input.placeholder = placeholder;
        this._input.addEventListener('input', () => this._onInput(this._input.value));

        wrapper.appendChild(this._input);
        el.appendChild(wrapper);
    }
}
