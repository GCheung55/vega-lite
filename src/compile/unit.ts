import * as log from '../log';

import {Axis} from '../axis';
import {X, Y, X2, Y2, Channel, UNIT_CHANNELS,  UNIT_SCALE_CHANNELS, NONSPATIAL_SCALE_CHANNELS, supportMark} from '../channel';
import {defaultConfig, Config, CellConfig} from '../config';
import {SOURCE, SUMMARY} from '../data';
import {Encoding} from '../encoding';
import * as vlEncoding from '../encoding'; // TODO: remove
import {ChannelDef, FieldDef, FieldRefOption, field, normalize, isFieldDef, isValueDef} from '../fielddef';
import {Legend} from '../legend';
import {Mark, MarkDef, TEXT as TEXT_MARK, FILL_STROKE_CONFIG, isMarkDef} from '../mark';
import {Scale, ScaleConfig, hasDiscreteDomain} from '../scale';
import {UnitSpec} from '../spec';
import {duplicate, extend, isArray, mergeDeep, Dict} from '../util';
import {VgData} from '../vega.schema';

import {parseAxisComponent} from './axis/parse';
import {applyConfig} from './common';
import {initMarkConfig, initTextConfig} from './config';
import {assembleData, parseUnitData} from './data/data';
import {parseLegendComponent} from './legend/parse';
import {assembleLayout, parseUnitLayout} from './layout';
import {Model} from './model';
import {parseMark} from './mark/mark';
import initScale from './scale/init';
import parseScaleComponent from './scale/parse';
import {stack, StackProperties} from '../stack';

/**
 * Internal model of Vega-Lite specification for the compiler.
 */
export class UnitModel extends Model {
  /**
   * Fixed width for the unit visualization.
   * If undefined (e.g., for ordinal scale), the width of the
   * visualization will be calculated dynamically.
   */
  public readonly width: number;

  /**
   * Fixed height for the unit visualization.
   * If undefined (e.g., for ordinal scale), the height of the
   * visualization will be calculated dynamically.
   */
  public readonly height: number;

  private readonly markDef: MarkDef;
  public readonly encoding: Encoding;
  protected readonly scales: Dict<Scale> = {};
  protected readonly axes: Dict<Axis> = {};
  protected readonly legends: Dict<Legend> = {};
  public readonly config: Config;
  public readonly stack: StackProperties;
  public children: Model[] = [];

  constructor(spec: UnitSpec, parent: Model, parentGivenName: string) {
    super(spec, parent, parentGivenName);

    // use top-level width / height or parent's top-level width / height

    // FIXME: once facet supports width/height, this is no longer correct!
    const providedWidth = spec.width !== undefined ? spec.width :
      parent ? parent['width'] : undefined; // only exists if parent is layer
    const providedHeight = spec.height !== undefined ? spec.height :
      parent ? parent['height'] : undefined; // only exists if parent is layer

    const markDef = this.markDef = this.initMarkDef(spec.mark);
    const mark =  markDef.type;
    const encoding = this.encoding = this.initEncoding(mark, spec.encoding || {});

    // TODO?: ideally we should use config only inside this constructor
    const config = this.config = this.initConfig(spec.config, parent);

    // calculate stack properties
    this.stack = stack(mark, encoding, config.stack);
    this.scales = this.initScales(mark, encoding, config, providedWidth, providedHeight);

    // TODO?: refactor these to be a part of the model as they are not really just config
    config.mark = initMarkConfig(mark, encoding, this.scales, this.stack, config);
    if (mark === 'text') { // FIXME: maybe we should refactor this
      config.text = initTextConfig(encoding, config);
    }

    this.axes = this.initAxes(encoding, config);
    this.legends = this.initLegend(encoding, config);

    // width / height
    const {width = this.width, height = this.height} = this.initSize(mark, this.scales,
      providedWidth,
      providedHeight,
      config.cell, config.scale
    );
    this.width = width;
    this.height = height;
  }

  private initMarkDef(mark: Mark | MarkDef) {
    if (isMarkDef(mark)) {
      return mark;
    }
    return {
      type: mark
    };
  }

  private initEncoding(mark: Mark, encoding: Encoding) {
    // clone to prevent side effect to the original spec
    encoding = duplicate(encoding);

    Object.keys(encoding).forEach((channel: any) => {
      if (!supportMark(channel, mark)) {
        // Drop unsupported channel

        log.warn(log.message.incompatibleChannel(channel, mark));
        delete encoding[channel];
        return;
      }

      if (isArray(encoding[channel])) {
        // Array of fieldDefs for detail channel (or production rule)
        encoding[channel] = encoding[channel].reduce((channelDefs: ChannelDef[], channelDef: ChannelDef) => {
          if (!isFieldDef(channelDef) && !isValueDef(channelDef)) { // TODO: datum
            log.warn(log.message.emptyFieldDef(channelDef, channel));
          } else {
            channelDefs.push(normalize(channelDef, channel));
          }
          return channelDefs;
        }, []);
      } else {
        const fieldDef = encoding[channel];
        if (fieldDef.field === undefined && fieldDef.value === undefined) { // TODO: datum
          log.warn(log.message.emptyFieldDef(fieldDef, channel));
          delete encoding[channel];
          return;
        }
        normalize(fieldDef, channel);
      }
    });
    return encoding;
  }

  /**
   * Init config by merging config from parent and, if applicable, from facet config
   */
  private initConfig(specConfig: Config, parent: Model) {
    let config = mergeDeep(duplicate(defaultConfig), parent ? parent.config : {}, specConfig);
    let hasFacetParent = false;
    while (parent !== null) {
      if (parent.isFacet()) {
        hasFacetParent = true;
        break;
      }
      parent = parent.parent;
    }

    if (hasFacetParent) {
      config.cell = extend({}, config.cell, config.facet.cell);
    }
    return config;
  }

  private initScales(mark: Mark, encoding: Encoding, config: Config, topLevelWidth:number, topLevelHeight: number): Dict<Scale> {
    const xyRangeSteps: number[] = [];

    return UNIT_SCALE_CHANNELS.reduce((scales, channel) => {
      if (vlEncoding.channelHasField(encoding, channel) ||
          (channel === X && vlEncoding.channelHasField(encoding, X2)) ||
          (channel === Y && vlEncoding.channelHasField(encoding, Y2))
        ) {
        const scale = scales[channel] = initScale(
          channel, encoding[channel], config, mark,
          channel === X ? topLevelWidth : channel === Y ? topLevelHeight : undefined,
          xyRangeSteps // for determine point / bar size
        );

        if (channel === X || channel === Y) {
          if (scale.rangeStep) {
            xyRangeSteps.push(scale.rangeStep);
          }
        }
      }
      return scales;
    }, {});
  }

  // TODO: consolidate this with scale?  Current scale range is in parseScale (later),
  // but not in initScale because scale range depends on size,
  // but size depends on scale type and rangeStep
  private initSize(mark: Mark, scale: Dict<Scale>, width: number, height: number, cellConfig: CellConfig, scaleConfig: ScaleConfig) {
    if (width === undefined) {
      if (scale[X]) {
        if (!hasDiscreteDomain(scale[X].type) || !scale[X].rangeStep) {
          width = cellConfig.width;
        } // else: Do nothing, use dynamic width.
      } else { // No scale X
        if (mark === TEXT_MARK) {
          // for text table without x/y scale we need wider rangeStep
          width = scaleConfig.textXRangeStep;
        } else {
          if (typeof scaleConfig.rangeStep === 'string') {
            throw new Error('_initSize does not handle string rangeSteps');
          }
          width = scaleConfig.rangeStep;
        }
      }
    }

    if (height === undefined) {
      if (scale[Y]) {
        if (!hasDiscreteDomain(scale[Y].type) || !scale[Y].rangeStep) {
          height = cellConfig.height;
        } // else: Do nothing, use dynamic height .
      } else {
        if (typeof scaleConfig.rangeStep === 'string') {
          throw new Error('_initSize does not handle string rangeSteps');
        }
        height = scaleConfig.rangeStep;
      }
    }

    return {width, height};
  }

  private initAxes(encoding: Encoding, config: Config): Dict<Axis> {
    return [X, Y].reduce(function(_axis, channel) {
      // Position Axis

      const channelDef = encoding[channel];
      if (isFieldDef(channelDef) ||
          (channel === X && isFieldDef(encoding.x2)) ||
          (channel === Y && isFieldDef(encoding.y2))) {

        const axisSpec = isFieldDef(channelDef) ? channelDef.axis : null;

        // We no longer support false in the schema, but we keep false here for backward compatability.
        if (axisSpec !== null && axisSpec !== false) {
          _axis[channel] = extend({},
            config.axis,
            axisSpec === true ? {} : axisSpec ||  {}
          );
        }
      }
      return _axis;
    }, {});
  }

  private initLegend(encoding: Encoding, config: Config): Dict<Legend> {
    return NONSPATIAL_SCALE_CHANNELS.reduce(function(_legend, channel) {
      const channelDef = encoding[channel];
      if (isFieldDef(channelDef)) {
        const legendSpec = channelDef.legend;
        // We no longer support false in the schema, but we keep false here for backward compatability.
        if (legendSpec !== null && legendSpec !== false) {
          _legend[channel] = extend({}, config.legend,
            legendSpec === true ? {} : legendSpec ||  {}
          );
        }
      }
      return _legend;
    }, {});
  }

  public parseData() {
    this.component.data = parseUnitData(this);
  }

  public parseSelectionData() {
    // TODO: @arvind can write this
    // We might need to split this into compileSelectionData and compileSelectionSignals?
  }

  public parseLayoutData() {
    this.component.layout = parseUnitLayout(this);
  }

  public parseScale() {
    this.component.scales = parseScaleComponent(this);
  }

  public parseMark() {
    this.component.mark = parseMark(this);
  }

  public parseAxis() {
    this.component.axes = parseAxisComponent(this, [X, Y]);
  }

  public parseAxisGroup(): void {
    return null;
  }

  public parseGridGroup(): void {
    return null;
  }

  public parseLegend() {
    this.component.legends = parseLegendComponent(this);
  }

  public assembleData(data: VgData[]): VgData[] {
    return assembleData(this, data);
  }

  public assembleLayout(layoutData: VgData[]): VgData[] {
    return assembleLayout(this, layoutData);
  }

  public assembleMarks() {
    return this.component.mark;
  }

  public assembleParentGroupProperties(cellConfig: CellConfig) {
    return applyConfig({}, cellConfig, FILL_STROKE_CONFIG.concat(['clip']));
  }

  public channels() {
    return UNIT_CHANNELS;
  }

  protected getMapping() {
    return this.encoding;
  }

  public toSpec(excludeConfig?: any, excludeData?: any) {
    const encoding = duplicate(this.encoding);
    let spec: any;

    spec = {
      mark: this.markDef,
      encoding: encoding
    };

    if (!excludeConfig) {
      spec.config = duplicate(this.config);
    }

    if (!excludeData) {
      spec.data = duplicate(this.data);
    }

    // remove defaults
    return spec;
  }

  public mark(): Mark {
    return this.markDef.type;
  }

  public channelHasField(channel: Channel) {
    return vlEncoding.channelHasField(this.encoding, channel);
  }

  public fieldDef(channel: Channel): FieldDef {
    // TODO: remove this || {}
    // Currently we have it to prevent null pointer exception.
    return this.encoding[channel] || {};
  }

  /** Get "field" reference for vega */
  public field(channel: Channel, opt: FieldRefOption = {}) {
    const fieldDef = this.fieldDef(channel);

    if (fieldDef.bin) { // bin has default suffix that depends on scaleType
      opt = extend({
        binSuffix: hasDiscreteDomain(this.scale(channel).type) ? 'range' : 'start'
      }, opt);
    }

    return field(fieldDef, opt);
  }

  public dataTable() {
    return this.dataName(vlEncoding.isAggregate(this.encoding) ? SUMMARY : SOURCE);
  }

  public isUnit() {
    return true;
  }
}
