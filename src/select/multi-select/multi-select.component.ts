import {
  AfterContentInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  QueryList,
  Renderer2,
  TemplateRef,
  ViewChild,
  ViewEncapsulation,
  forwardRef,
} from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { Observable, combineLatest, of } from 'rxjs';
import {
  map,
  publishReplay,
  refCount,
  startWith,
  switchMap,
  takeUntil,
} from 'rxjs/operators';

import { ComponentSize } from '../../types';
import { Bem, buildBem } from '../../utils/bem';
import { BaseSelect } from '../base-select';
import { OptionComponent } from '../option/option.component';
import { TagClassFn } from '../select.types';

@Component({
  selector: 'aui-multi-select',
  templateUrl: './multi-select.component.html',
  styleUrls: [
    '../../input/input.component.scss',
    '../../tag/tag.component.scss',
    './multi-select.component.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  preserveWhitespaces: false,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MultiSelectComponent),
      multi: true,
    },
    {
      provide: BaseSelect,
      useExisting: MultiSelectComponent,
    },
  ],
})
export class MultiSelectComponent extends BaseSelect<any[]>
  implements AfterContentInit {
  bem: Bem = buildBem('aui-multi-select');
  selectedOptions$: Observable<
    Array<{ value: any; label?: string | TemplateRef<any>; labelContext?: any }>
  >;

  selectedValues: any[] = [];
  values$: Observable<any[]> = this.value$$.asObservable();

  @Input()
  tagClassFn: TagClassFn;

  @ViewChild('inputRef', { static: true })
  inputRef: ElementRef;

  get rootClass() {
    const size = this.size || ComponentSize.Medium;
    return `aui-input ${this.bem.block(size)} ${
      this.disabled ? 'isDisabled' : ''
    } ${this.focused ? 'isFocused' : ''} ${
      this.displayClearBtn ? 'isClearable' : ''
    }`;
  }

  get tagSize() {
    if (this.size === ComponentSize.Large) {
      return ComponentSize.Medium;
    } else {
      return ComponentSize.Mini;
    }
  }

  get inputClass() {
    return `${this.bem.element('input', {
      hidden: this.inputReadonly,
    })} aui-tag aui-tag--${this.tagSize}`;
  }

  get displayPlaceholder() {
    return !this.selectedValues.length && this.inputReadonly;
  }

  get displayClearBtn() {
    return !this.disabled && this.clearable && this.selectedValues.length;
  }

  focused = false;
  trackByValue = (_: number, item: OptionComponent) => this.trackFn(item.value);

  constructor(cdr: ChangeDetectorRef, private readonly renderer: Renderer2) {
    super(cdr);
    this.values$.pipe(takeUntil(this.destroy$$)).subscribe(values => {
      this.selectedValues = values;
    });
  }

  ngAfterContentInit() {
    super.ngAfterContentInit();

    this.selectedOptions$ = combineLatest([
      this.value$,
      this.contentOptions.changes.pipe(
        startWith(this.contentOptions),
        switchMap((options: QueryList<OptionComponent>) =>
          options.length > 0
            ? combineLatest(
                options.map(option =>
                  combineLatest([
                    option.value$,
                    option.label$,
                    option.labelContext$,
                  ]).pipe(
                    map(([value, label, labelContext]) => ({
                      value,
                      label,
                      labelContext,
                    })),
                  ),
                ),
              )
            : of([]),
        ),
      ),
      this.trackFn$,
    ]).pipe(
      map(([values, options, trackFn]) =>
        values.map(
          value =>
            options.find(
              option => trackFn(option.value) === trackFn(value),
            ) || { value },
        ),
      ),
      publishReplay(1),
      refCount(),
    );
  }

  onShowOptions() {
    super.onShowOptions();
    this.inputRef.nativeElement.focus();
  }

  onHideOptions() {
    super.onHideOptions();
    this.inputRef.nativeElement.value = '';
    this.renderer.removeStyle(this.inputRef.nativeElement, 'width');
  }

  onInput(event: Event) {
    super.onInput(event);
    // TODO: optimize performance
    this.renderer.removeStyle(this.inputRef.nativeElement, 'width');
    this.renderer.setStyle(
      this.inputRef.nativeElement,
      'width',
      this.inputRef.nativeElement.scrollWidth + 'px',
    );
    this.tooltipRef.updatePosition();
  }

  onInputFocus() {
    this.focused = true;
  }

  onInputBlur() {
    this.focused = false;
    this.closeOption();
  }

  onKeyDown(event: KeyboardEvent) {
    if (
      event.key === 'Backspace' &&
      this.filterString === '' &&
      this.selectedValues.length > 0
    ) {
      this.removeValue(this.selectedValues[this.selectedValues.length - 1]);
      event.stopPropagation();
      event.preventDefault();
    } else if (event.key === 'Enter') {
      if (
        this.selectedValues
          .map(value => this.trackFn(value))
          .includes((event.target as HTMLInputElement).value)
      ) {
        return;
      }
      this.selectFocusedOption();
      event.stopPropagation();
      event.preventDefault();
    } else {
      super.onKeyDown(event);
    }
  }

  writeValue(val: any[]) {
    this.value$$.next(val || []);
    this.resetInput();
    requestAnimationFrame(() => {
      this.tooltipRef.updatePosition();
    });
  }

  selectOption(option: OptionComponent) {
    if (option.selected) {
      this.removeValue(option.value);
    } else {
      this.addValue(option.value);
    }
    const isCustom = !this.contentOptions.find(
      ({ value }) => value === option.value,
    );
    if (isCustom) {
      this.resetFocusedOption();
    }
  }

  addValue(value: any) {
    const values = this.selectedValues.concat(value);
    this.emitValueChange(values);
    if (this.onChange) {
      this.resetInput();
      requestAnimationFrame(() => {
        this.tooltipRef.updatePosition();
      });
    }
  }

  removeValue(value: any) {
    const values = this.selectedValues.filter(
      item => this.trackFn(item) !== this.trackFn(value),
    );
    this.emitValueChange(values);
    if (this.onChange) {
      this.resetInput();
      requestAnimationFrame(() => {
        this.tooltipRef.updatePosition();
      });
    }
  }

  clearValue(event: Event) {
    this.emitValueChange([]);
    event.stopPropagation();
    event.preventDefault();
  }

  private resetInput() {
    this.inputRef.nativeElement.value = '';
    this.filterString = '';
  }
}
