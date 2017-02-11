import {isFieldDef} from '../../fielddef';
import {Config} from '../../config';
import {isInternalData} from '../../data';
import {FieldDef} from '../../fielddef';
import {ANCHOR, OFFSET} from '../../channel';
import {VgLabelTransform} from '../../vega.schema';

import {UnitModel} from '../unit';

import {LayoutCompiler} from './base';
import {text} from './text';
import * as ref from './valueref';

export const label: LayoutCompiler = {
  vgMark: 'text',
  role: undefined,

  encodeEntry: text.encodeEntry,

  transform: (model: UnitModel) => {
    const data = model.data();
    if (isInternalData(data)) {
      let t = {} as VgLabelTransform;

      // TODO: check if its internalData
      const referenceMark = model.parent().children().filter((sibling) => sibling.name() === data.ref)[0];

      /* Labeling properties */
      const config = model.config();

      t.ref = referenceMark.name();
      t.anchor = anchor(model.encoding().anchor, model.scaleName(ANCHOR), config);
      t.offset = offset(model.encoding().offset, model.scaleName(OFFSET), config);

      return t;
    } else {
      throw new Error('Label requires internal data');
    }
  }
};


function anchor(fieldDef: FieldDef, scaleName: string, config: Config): string {
  if (isFieldDef(fieldDef)) {
     const def = ref.fieldRef(fieldDef, scaleName, {datum: true});
  }

  // const orient = config.mark.orient;

  // return sensible default given orient, model

  return 'top';
  // return 'auto';
}

function offset(fieldDef: FieldDef, scaleName: string, config: Config): number | string {
  if (isFieldDef(fieldDef)) {
    const def = ref.fieldRef(fieldDef, scaleName, {datum: true});
  }

  // const orient = config.mark.orient;

  // return sensible default given orient, model

  return 1;
  // return 'auto';
}
