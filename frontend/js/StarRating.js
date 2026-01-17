/**
 /frontend/js/StarRating.js
 */
class StarRating {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            showValue: options.showValue !== undefined ? options.showValue : true,
            showCount: options.showCount !== undefined ? options.showCount : true,
            clearableText: options.clearableText || '×'
        };
        this.value = 0;
        this.count = 0;
        this.render();
        this.attachEvents();
    }

    render() {
        this.container.innerHTML = `
            <div class="star-rating-wrapper" data-has-value="false">
                ${this.options.showValue ? '<span class="rating-value">0.0</span>' : ''}
                ${this.options.showCount ? '<span class="rating-count"></span>' : ''}
                <div class="rating-clear-wrapper">
                    <span class="rating-clear-btn" title="Wyczyść ocenę">${this.options.clearableText}</span>
                </div>
                <div class="rating-stars"></div>
            </div>
        `;

        const starsContainer = this.container.querySelector('.rating-stars');
        this.valueEl = this.container.querySelector('.rating-value');
        this.countEl = this.container.querySelector('.rating-count');
        this.clearBtn = this.container.querySelector('.rating-clear-btn');
        this.wrapper = this.container.querySelector('.star-rating-wrapper');

        let starsHtml = '';
        for (let i = 5; i >= 0.5; i -= 0.5) {
            const value = i;
            const isHalfStar = (value * 10) % 10 === 5;
            const starType = isHalfStar ? 'left' : 'right';

            const safeValue = value.toString().replace('.', '_');
            const inputId = `star-${Math.random().toString(36).substring(2, 9)}-${safeValue}`;

            starsHtml += `
                <input type="radio" name="${inputId}-group" id="${inputId}" value="${value}">
                <label for="${inputId}" class="${starType}" title="${value.toFixed(1)}"></label>
            `;
        }
        starsContainer.innerHTML = starsHtml;

        this.labels = Array.from(starsContainer.querySelectorAll('label'));
        this.inputs = Array.from(starsContainer.querySelectorAll('input'));
    }

    attachEvents() {
        const starsContainer = this.container.querySelector('.rating-stars');

        this.labels.forEach(label => {
            const input = this.container.querySelector('#' + label.htmlFor);
            const ratingValue = parseFloat(input.value);

            label.addEventListener('mouseenter', () => this.hoverTo(ratingValue));
            label.addEventListener('touchstart', () => this.hoverTo(ratingValue), { passive: true });

            label.addEventListener('click', (ev) => {
                ev.preventDefault();
                this.setValue(ratingValue, true);
            });
        });

        starsContainer.addEventListener('mouseleave', () => this.clearHover());
        starsContainer.addEventListener('touchend', () => this.clearHover());
        starsContainer.addEventListener('touchcancel', () => this.clearHover());

        this.clearBtn.addEventListener('click', () => {
            this.setValue(0, true);
        });
    }

    hoverTo(rating) {
        this.labels.forEach(l => {
            const v = parseFloat(this.container.querySelector('#' + l.htmlFor).value);
            l.classList.toggle('hover', v <= rating);
        });
    }

    clearHover() {
        this.labels.forEach(l => l.classList.remove('hover'));
    }

    updateVisuals() {
        if (this.valueEl) {
            this.valueEl.textContent = this.value.toFixed(1);
        }

        if (this.countEl) {
            this.countEl.textContent = this.count > 0 ? `(${this.count})` : '';
        }

        this.labels.forEach(l => {
            const v = parseFloat(this.container.querySelector('#' + l.htmlFor).value);
            l.classList.toggle('active', v <= this.value && this.value !== 0);
        });

        const checkedInput = this.inputs.find(i => Math.abs(parseFloat(i.value) - this.value) < 0.1);
        this.inputs.forEach(i => i.checked = false);
        if (checkedInput) {
            checkedInput.checked = true;
        }

        this.wrapper.dataset.hasValue = (this.value > 0).toString();
    }

    setValue(rating, dispatchEvent = false) {
        this.value = parseFloat(rating) || 0;
        this.updateVisuals();

        if (dispatchEvent) {
            this.container.dispatchEvent(new CustomEvent('ratingChanged', {
                detail: { rating: this.value },
                bubbles: true
            }));
        }
    }

    setCount(count) {
        this.count = parseInt(count) || 0;
        this.updateVisuals();
    }

    getValue() {
        return this.value;
    }
}