// https://github.com/Microsoft/TypeScript/blob/master/doc/spec.md#11-ambient-declarations
declare var exports;

import {SHARED_DOMAIN_OPS} from '../aggregate';
import {COLUMN, ROW, X, Y, SHAPE, SIZE, COLOR, TEXT, hasScale, Channel} from '../channel';
import {StackOffset} from '../config';
import {SCALE, STACKED_SCALE} from '../data';
import {FieldDef, field, isMeasure} from '../fielddef';
import {Mark, BAR, TEXT as TEXT_MARK, RULE, TICK} from '../mark';
import {Scale, ScaleType, NiceTime} from '../scale';
import {TimeUnit} from '../timeunit';
import {NOMINAL, ORDINAL, QUANTITATIVE, TEMPORAL} from '../type';
import {contains, extend, Dict, hash, vals} from '../util';
import {VgScale, isUnionedDomain} from '../vega.schema';


import {Model} from './model';
import {rawDomain, smallestUnit} from './time';
import {UnitModel} from './unit';
import {LayerModel} from './layer';

/**
 * Color Ramp's scale for legends.  This scale has to be ordinal so that its
 * legends show a list of numbers.
 */
export const COLOR_LEGEND = 'color_legend';

// scale used to get labels for binned color scales
export const COLOR_LEGEND_LABEL = 'color_legend_label';


// FIXME: With layer and concat, scaleComponent should decompose between
// ScaleSignature and ScaleDomain[].
// Basically, if two unit specs has the same scale, signature for a particular channel,
// the scale can be unioned by combining the domain.
export type ScaleComponent = VgScale;

export type ScaleComponents = {
  main: ScaleComponent;
  colorLegend?: ScaleComponent,
  binColorLegend?: ScaleComponent
}

export function parseScaleComponent(model: Model): Dict<ScaleComponents> {
  return model.channels().reduce(function(scale: Dict<ScaleComponents>, channel: Channel) {
      if (model.scale(channel)) {
        const fieldDef = model.fieldDef(channel);
        const scales: ScaleComponents = {
          main: parseMainScale(model, fieldDef, channel)
        };

        // Add additional scales needed to support ordinal legends (list of values)
        // for color ramp.
        if (channel === COLOR && model.legend(COLOR) && (fieldDef.type === ORDINAL || fieldDef.bin || fieldDef.timeUnit)) {
          scales.colorLegend = parseColorLegendScale(model, fieldDef);
          if (fieldDef.bin) {
            scales.binColorLegend = parseBinColorLegendLabel(model, fieldDef);
          }
        }

        scale[channel] = scales;
      }
      return scale;
    }, {} as Dict<ScaleComponents>);
}

/**
 * Return the main scale for each channel.  (Only color can have multiple scales.)
 */
function parseMainScale(model: Model, fieldDef: FieldDef, channel: Channel) {
  const scale = model.scale(channel);
  const sort = model.sort(channel);

  let scaleDef: any = {
    name: model.scaleName(channel),
    type: scale.type,
  };

  scaleDef.domain = domain(scale, model, channel);
  extend(scaleDef, rangeMixins(scale, model, channel));

  if (sort && (typeof sort === 'string' ? sort : sort.order) === 'descending') {
    scaleDef.reverse = true;
  }

  // Add optional properties
  [
    // general properties
    'round',
    // quantitative / time
    'clamp', 'nice',
    // quantitative
    'exponent', 'zero',
    // ordinal
    'padding', 'points'
  ].forEach(function(property) {
    const value = exports[property](scale, channel, fieldDef, model);
    if (value !== undefined) {
      scaleDef[property] = value;
    }
  });

  return scaleDef;
}

/**
 *  Return a scale  for producing ordinal scale for legends.
 *  - For an ordinal field, provide an ordinal scale that maps rank values to field value
 *  - For a field with bin or timeUnit, provide an identity ordinal scale
 *    (mapping the field values to themselves)
 */
function parseColorLegendScale(model: Model, fieldDef: FieldDef): ScaleComponent {
  return {
    name: model.scaleName(COLOR_LEGEND),
    type: ScaleType.ORDINAL,
    domain: {
      data: model.dataName(SCALE),
      // use rank_<field> for ordinal type, for bin and timeUnit use default field
      field: model.field(COLOR, (fieldDef.bin || fieldDef.timeUnit) ? {} : {prefn: 'rank_'}),
      sort: true
    },
    range: {data: model.dataName(SCALE), field: model.field(COLOR), sort: true}
  };
}

/**
 *  Return an additional scale for bin labels because we need to map bin_start to bin_range in legends
 */
function parseBinColorLegendLabel(model: Model, fieldDef: FieldDef): ScaleComponent {
  return {
    name: model.scaleName(COLOR_LEGEND_LABEL),
    type: ScaleType.ORDINAL,
    domain: {
      data: model.dataName(SCALE),
      field: model.field(COLOR),
      sort: true
    },
    range: {
      data: model.dataName(SCALE),
      field: field(fieldDef, {binSuffix: '_range'}),
      sort: {
        field: model.field(COLOR, { binSuffix: '_start' }),
        op: 'min' // min or max doesn't matter since same _range would have the same _start
      }
    }
  };
}

export function scaleType(scale: Scale, fieldDef: FieldDef, channel: Channel, mark: Mark): ScaleType {
  if (!hasScale(channel)) {
    // There is no scale for these channels
    return null;
  }

  // We can't use linear/time for row, column or shape
  if (contains([ROW, COLUMN, SHAPE], channel)) {
    return ScaleType.ORDINAL;
  }

  if (scale.type !== undefined) {
    return scale.type;
  }

  switch (fieldDef.type) {
    case NOMINAL:
      return ScaleType.ORDINAL;
    case ORDINAL:
      if (channel === COLOR) {
        return ScaleType.LINEAR; // time has order, so use interpolated ordinal color scale.
      }
      return ScaleType.ORDINAL;
    case TEMPORAL:
      if (channel === COLOR) {
        return ScaleType.TIME; // time has order, so use interpolated ordinal color scale.
      }

      if (fieldDef.timeUnit) {
        switch (fieldDef.timeUnit) {
          case TimeUnit.HOURS:
          case TimeUnit.DAY:
          case TimeUnit.MONTH:
            return ScaleType.ORDINAL;
          default:
            // date, year, minute, second, yearmonth, monthday, ...
            return ScaleType.TIME;
        }
      }
      return ScaleType.TIME;

    case QUANTITATIVE:
      if (fieldDef.bin) {
        return contains([X, Y, COLOR], channel) ? ScaleType.LINEAR : ScaleType.ORDINAL;
      }
      return ScaleType.LINEAR;
  }

  // should never reach this
  return null;
}

export function domain(scale: Scale, model: Model, channel:Channel): any {
  const fieldDef = model.fieldDef(channel);

  if (scale.domain) { // explicit value
    return scale.domain;
  }

  // special case for temporal scale
  if (fieldDef.type === TEMPORAL) {
    if (rawDomain(fieldDef.timeUnit, channel)) {
      return {
        data: fieldDef.timeUnit,
        field: 'date'
      };
    }

    return {
      data: model.dataName(SCALE),
      field: model.field(channel),
      sort: {
        field: model.field(channel),
        op: 'min'
      }
    };
  }

  // For stack, use STACKED data.
  const stack = model.stack();
  if (stack && channel === stack.fieldChannel) {
    if(stack.offset === StackOffset.NORMALIZE) {
      return [0, 1];
    }
    return {
      data: model.dataName(STACKED_SCALE),
      // STACKED_SCALE produces sum of the field's value e.g., sum of sum, sum of distinct
      field: model.field(channel, {prefn: 'sum_'})
    };
  }

  const includeRawDomain = _includeRawDomain(scale, model, channel),
  sort = domainSort(model, channel, scale.type);

  if (includeRawDomain) { // includeRawDomain - only Q/T
    return {
      data: SCALE,
      field: model.field(channel, {noAggregate: true})
    };
  } else if (fieldDef.bin) { // bin
    return scale.type === ScaleType.ORDINAL ? {
      // ordinal bin scale takes domain from bin_range, ordered by bin_start
      data: model.dataName(SCALE),
      field: model.field(channel, { binSuffix: '_range' }),
      sort: {
        field: model.field(channel, { binSuffix: '_start' }),
        op: 'min' // min or max doesn't matter since same _range would have the same _start
      }
    } : channel === COLOR ? {
      // Currently, binned on color uses linear scale and thus use _start point
      data: model.dataName(SCALE),
      field: model.field(channel, { binSuffix: '_start' })
    } : {
      // other linear bin scale merges both bin_start and bin_end for non-ordinal scale
      data: model.dataName(SCALE),
      field: [
        model.field(channel, { binSuffix: '_start' }),
        model.field(channel, { binSuffix: '_end' })
      ]
    };
  } else if (sort) { // have sort -- only for ordinal
    return {
      // If sort by aggregation of a specified sort field, we need to use SCALE table,
      // so we can aggregate values for the scale independently from the main aggregation.
      data: sort.op ? SCALE : model.dataName(SCALE),
      field: (fieldDef.type === ORDINAL && channel === COLOR) ? model.field(channel, {prefn: 'rank_'}) : model.field(channel),
      sort: sort
    };
  } else {
    return {
      data: model.dataName(SCALE),
      field: (fieldDef.type === ORDINAL && channel === COLOR) ? model.field(channel, {prefn: 'rank_'}) : model.field(channel),
    };
  }
}

export function domainSort(model: Model, channel: Channel, scaleType: ScaleType): any {
  if (scaleType !== ScaleType.ORDINAL) {
    return undefined;
  }

  const sort = model.sort(channel);
  if (contains(['ascending', 'descending', undefined /* default =ascending*/], sort)) {
    return true;
  }

  // Sorted based on an aggregate calculation over a specified sort field (only for ordinal scale)
  if (typeof sort !== 'string') {
    return {
      op: sort.op,
      field: sort.field
    };
  }

  // sort === 'none'
  return undefined;
}


/**
 * Determine if includeRawDomain should be activated for this scale.
 * @return {Boolean} Returns true if all of the following conditons applies:
 * 1. `includeRawDomain` is enabled either through scale or config
 * 2. Aggregation function is not `count` or `sum`
 * 3. The scale is quantitative or time scale.
 */
function _includeRawDomain (scale: Scale, model: Model, channel: Channel) {
  const fieldDef = model.fieldDef(channel);

  return scale.includeRawDomain && //  if includeRawDomain is enabled
    // only applied to aggregate table
    fieldDef.aggregate &&
    // only activated if used with aggregate functions that produces values ranging in the domain of the SCALE data
    SHARED_DOMAIN_OPS.indexOf(fieldDef.aggregate) >= 0 &&
    (
      // Q always uses quantitative scale except when it's binned.
      // Binned field has similar values in both the SCALE table and the summary table
      // but the summary table has fewer values, therefore binned fields draw
      // domain values from the summary table.
      (fieldDef.type === QUANTITATIVE && !fieldDef.bin) ||
      // T uses non-ordinal scale when there's no unit or when the unit is not ordinal.
      (fieldDef.type === TEMPORAL && contains([ScaleType.TIME, ScaleType.UTC], scale.type))
    );
}


export function rangeMixins(scale: Scale, model: Model, channel: Channel): any {
  // TODO: need to add rule for quantile, quantize, threshold scale

  const fieldDef = model.fieldDef(channel);
  const scaleConfig = model.config().scale;

  if (scale.type === ScaleType.ORDINAL && scale.bandSize && contains([X, Y], channel)) {
    return {bandSize: scale.bandSize};
  }

  if (scale.range && !contains([X, Y, ROW, COLUMN], channel)) {
    // explicit value (Do not allow explicit values for X, Y, ROW, COLUMN)
    return {range: scale.range};
  }
  switch (channel) {
    case ROW:
      return {range: 'height'};
    case COLUMN:
      return {range: 'width'};
  }

  // If not ROW / COLUMN, we can assume that this is a unit spec.
  const unitModel = model as UnitModel;
  switch (channel) {
    case X:
      // we can't use {range: "width"} here since we put scale in the root group
      // not inside the cell, so scale is reusable for axes group

      return {
        rangeMin: 0,
        rangeMax: unitModel.config().cell.width // Fixed cell width for non-ordinal
      };
    case Y:
      return {
        rangeMin: unitModel.config().cell.height, // Fixed cell height for non-ordinal
        rangeMax: 0
      };
    case SIZE:

      if (unitModel.mark() === BAR) {
        if (scaleConfig.barSizeRange !== undefined) {
          return {range: scaleConfig.barSizeRange};
        }
        const dimension = model.config().mark.orient === 'horizontal' ? Y : X;
        return {range: [model.config().mark.barThinSize, model.scale(dimension).bandSize]};
      } else if (unitModel.mark() === TEXT_MARK) {
        return {range: scaleConfig.fontSizeRange };
      } else if (unitModel.mark() === RULE) {
        return {range: scaleConfig.ruleSizeRange };
      } else if (unitModel.mark() === TICK) {
        return {range: scaleConfig.tickSizeRange };
      }
      // else -- point, square, circle
      if (scaleConfig.pointSizeRange !== undefined) {
        return {range: scaleConfig.pointSizeRange};
      }

      const bandSize = pointBandSize(unitModel);

      return {range: [9, (bandSize - 2) * (bandSize - 2)]};
    case SHAPE:
      return {range: scaleConfig.shapeRange};
    case COLOR:
      if (fieldDef.type === NOMINAL) {
        return {range: scaleConfig.nominalColorRange};
      }
      // else -- ordinal, time, or quantitative
      return {range: scaleConfig.sequentialColorRange};
  }
  return {};
}

function pointBandSize(model: UnitModel) {
  const scaleConfig = model.config().scale;

  const hasX = model.has(X);
  const hasY = model.has(Y);

  const xIsMeasure = isMeasure(model.encoding().x);
  const yIsMeasure = isMeasure(model.encoding().y);

  if (hasX && hasY) {
    return xIsMeasure !== yIsMeasure ?
      model.scale(xIsMeasure ? Y : X).bandSize :
      Math.min(
        model.scale(X).bandSize || scaleConfig.bandSize,
        model.scale(Y).bandSize || scaleConfig.bandSize
      );
  } else if (hasY) {
    return yIsMeasure ? model.config().scale.bandSize : model.scale(Y).bandSize;
  } else if (hasX) {
    return xIsMeasure ? model.config().scale.bandSize : model.scale(X).bandSize;
  }
  return model.config().scale.bandSize;
}

export function clamp(scale: Scale) {
  // Only works for scale with both continuous domain continuous range
  // (Doesn't work for quantize, quantile, threshold, ordinal)
  if (contains([ScaleType.LINEAR, ScaleType.POW, ScaleType.SQRT,
        ScaleType.LOG, ScaleType.TIME, ScaleType.UTC], scale.type)) {
    return scale.clamp;
  }
  return undefined;
}

export function exponent(scale: Scale) {
  if (scale.type === ScaleType.POW) {
    return scale.exponent;
  }
  return undefined;
}

export function nice(scale: Scale, channel: Channel, fieldDef: FieldDef): boolean | NiceTime {
  if (contains([ScaleType.LINEAR, ScaleType.POW, ScaleType.SQRT, ScaleType.LOG,
        ScaleType.TIME, ScaleType.UTC, ScaleType.QUANTIZE], scale.type)) {

    if (scale.nice !== undefined) {
      return scale.nice;
    }
    if (contains([ScaleType.TIME, ScaleType.UTC], scale.type)) {
      return smallestUnit(fieldDef.timeUnit) as any;
    }
    return contains([X, Y], channel); // return true for quantitative X/Y
  }
  return undefined;
}


export function padding(scale: Scale, channel: Channel) {
  /* Padding is only allowed for X and Y.
   *
   * Basically it doesn't make sense to add padding for color and size.
   *
   * We do not use d3 scale's padding for row/column because padding there
   * is a ratio ([0, 1]) and it causes the padding to be decimals.
   * Therefore, we manually calculate padding in the layout by ourselves.
   */
  if (scale.type === ScaleType.ORDINAL && contains([X, Y], channel)) {
    return scale.padding;
  }
  return undefined;
}

export function points(scale: Scale, channel: Channel, __, model: Model) {
  if (scale.type === ScaleType.ORDINAL && contains([X, Y], channel)) {
    // We always use ordinal point scale for x and y.
    // Thus `points` isn't included in the scale's schema.
    return true;
  }
  return undefined;
}

export function round(scale: Scale, channel: Channel) {
  if (contains([X, Y, ROW, COLUMN, SIZE], channel) && scale.round !== undefined) {
    return scale.round;
  }

  return undefined;
}

export function zero(scale: Scale, channel: Channel, fieldDef: FieldDef) {
  // only applicable for non-ordinal scale
  if (!contains([ScaleType.TIME, ScaleType.UTC, ScaleType.ORDINAL], scale.type)) {
    if (scale.zero !== undefined) {
      return scale.zero;
    }
    // By default, return true only for non-binned, quantitative x-scale or y-scale.
    return !fieldDef.bin && contains([X, Y], channel);
  }
  return undefined;
}

/**
 * Merge scales from children by unioning their domains
 */
export function mergeScales(model: LayerModel, channel: string) {
  let scaleComp: ScaleComponents = null;

  let domains = {};

  model.children().forEach((child) => {
    const childScales = child.component.scale[channel];
    if (!childScales) {
      return;
    }

    // range and other things will just be defined by the first scale
    if (!scaleComp) {
      scaleComp = childScales;
    }

    // the child domain may itself be a union of domains
    const childDomain = childScales.main.domain;
    if (isUnionedDomain(childDomain)) {
      // if the domain is itself a union domain, concat
      childDomain.fields.forEach((domain) => {
        domains[hash(domain)] = domain;
      });
    } else {
      domains[hash(childDomain)] = childDomain;
    }

    // add color legend and color legend bin scales if we don't have them yet
    if (childScales.colorLegend) {
      scaleComp.colorLegend = scaleComp.colorLegend ? scaleComp.colorLegend : childScales.colorLegend;
    }
    if (childScales.binColorLegend) {
      scaleComp.binColorLegend = scaleComp.binColorLegend ? scaleComp.binColorLegend : childScales.binColorLegend;
    }

    // rename scale references to merged scales
    [childScales.main, childScales.colorLegend, childScales.binColorLegend]
      .filter((x) => !!x)
      .forEach(function (scale) {
        const scaleNameWithoutPrefix = scale.name.substr(child.name('').length);
        const newName = model.scaleName(scaleNameWithoutPrefix);
        child.renameScale(scale.name, newName);
        scale.name = newName;
      });

    delete child.component.scale[channel];
  });

  // construct the domain that will be used for all scales
  const domainArr = vals(domains);
  let domain;
  if (domainArr.length ===  1) {
    domain = domainArr[0];
  } else {
    // Fixme: we have to ignore explicit data domains for now because vega does not support unioning them
    domain = {
      fields: domainArr
    };
  }

  // set domains for all scales
  scaleComp.main.domain = domain;
  if (scaleComp.colorLegend) {
    scaleComp.colorLegend.domain = domain;
  }
  if (scaleComp.binColorLegend) {
    scaleComp.binColorLegend.domain = domain;
  }

  return scaleComp;
}
