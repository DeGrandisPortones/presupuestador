import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Button from '../../ui/Button.jsx';
import Input from '../../ui/Input.jsx';
import { useAuthStore } from '../../domain/auth/store.js';
import {
  adminGetCatalog,
  adminGetTechnicalMeasurementRules,
  adminSaveTechnicalMeasurementRules,
  adminGetTechnicalMeasurementFieldDefinitions,
  adminSaveTechnicalMeasurementFieldDefinitions,
} from '../../api/admin.js';
import {
  TECHNICAL_RULE_OPERATORS,
  TECHNICAL_RULE_ACTIONS,
  mergeMeasurementFields,
  parseOptions,
  VALUE_SOURCE_OPTIONS,
  USER_CONTEXT_SOURCE_OPTIONS,
  QUOTE_CONTEXT_SOURCE_OPTIONS,
} from '../../domain/measurement/technicalMeasurementRuleFields.js';

const SECTION_OPTIONS = [
  { value: 'datos_generales', label: 'Datos generales' },
  { value: 'esquema_medidas', label: 'Esquema (medidas)' },
  { value: 'revestimiento', label: 'Revestimiento' },
  { value: 'puerta_estructura', label: 'Puerta / estructura' },
  { value: 'rebajes_suelo', label: 'Rebajes / suelo' },
  { value: 'observaciones', label: 'Observaciones' },
  { value: 'otros', label: 'Otros / bloque aparte' },
];

function productLabel(product) {
  return `${product.display_name || product.name}${product.code ? ` · ${product.code}` : ''}`;
}
function newField(index = 1) {
  return {
    key: '',
    label: '',
    type: 'text',
    section: 'otros',
    optionsText: '',
    active: true,
    required: false,
    value_source_type: 'manual',
    value_source_path: '',
    sort_order: index,
  };
}
function newRule(index = 1) {
  return {
    id: `rule_${Date.now()}_${index}`,
    name: '',
    active: true,
    source_key: '',
    operator: '=',
    compare_value: '',
    action_type: 'set_value',
    target_field: '',
    target_value: '',
    target_options_text: '',
    apply_to_odoo: false,
    product_id: '',
    product_label: '',
    sort_order: index,
  };
}
function normalizeFieldDraft(field, index) {
  return {
    key: String(field?.key || '').trim(),
    label: String(field?.label || '').trim(),
    type: String(field?.type || 'text').trim().toLowerCase(),
    section: String(field?.section || 'otros').trim().toLowerCase(),
    optionsText: Array.isArray(field?.options)
      ? field.options.map((item) => item?.value || item).filter(Boolean).join(', ')
      : String(field?.optionsText || '').trim(),
    active: field?.active !== false,
    required: field?.required === true,
    value_source_type: String(field?.value_source_type || 'manual').trim(),
    value_source_path: String(field?.value_source_path || '').trim(),
    sort_order: Number(field?.sort_order || index + 1) || index + 1,
  };
}
function normalizeRuleDraft(rule, index) {
  return {
    id: String(rule?.id || `rule_${index + 1}`),
    name: String(rule?.name || '').trim(),
    active: rule?.active !== false,
    source_key: String(rule?.source_key || '').trim(),
    operator: String(rule?.operator || '='),
    compare_value: rule?.compare_value ?? '',
    action_type: String(rule?.action_type || 'set_value'),
    target_field: String(rule?.target_field || '').trim(),
    target_value: rule?.target_value ?? '',
    target_options_text: Array.isArray(rule?.target_options) ? rule.target_options.join(', ') : String(rule?.target_options || '').trim(),
    apply_to_odoo: rule?.apply_to_odoo === true,
    product_id: Number(rule?.product_id || 0) || '',
    product_label: String(rule?.product_label || '').trim(),
    sort_order: Number(rule?.sort_order || index + 1) || index + 1,
  };
}

export default function SuperuserMeasurementRulesPage() {
  const user = useAuthStore((s) => s.user);
  const [savingFields, setSavingFields] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [fieldDraft, setFieldDraft] = useState({ fields: [] });
  const [ruleDraft, setRuleDraft] = useState({ rules: [] });

  const fieldsQ = useQuery({ queryKey: ['technicalMeasurementFields'], queryFn: adminGetTechnicalMeasurementFieldDefinitions, enabled: !!user?.is_superuser });
  const rulesQ = useQuery({ queryKey: ['technicalMeasurementRules'], queryFn: adminGetTechnicalMeasurementRules, enabled: !!user?.is_superuser });
  const catalogQ = useQuery({ queryKey: ['adminCatalogRulesProducts'], queryFn: () => adminGetCatalog('porton'), enabled: !!user?.is_superuser });

  useEffect(() => {
    if (!fieldsQ.data) return;
    setFieldDraft({ fields: (fieldsQ.data.fields || []).map((field, index) => normalizeFieldDraft(field, index)) });
  }, [fieldsQ.data]);

  useEffect(() => {
    if (!rulesQ.data) return;
    setRuleDraft({ rules: (rulesQ.data.rules || []).map((rule, index) => normalizeRuleDraft(rule, index)) });
  }, [rulesQ.data]);

  const products = Array.isArray(catalogQ.data?.products) ? catalogQ.data.products : [];
  const allFields = useMemo(() => {
    const configuredFields = (fieldDraft.fields || []).map((field, index) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      section: field.section,
      options: parseOptions(field.optionsText),
      active: field.active !== false,
      required: field.required === true,
      value_source_type: field.value_source_type,
      value_source_path: field.value_source_path,
      sort_order: field.sort_order || index + 1,
    }));
    return mergeMeasurementFields(configuredFields);
  }, [fieldDraft.fields]);

  const sourceFieldOptions = allFields;
  const targetFieldOptions = allFields.filter((item) => !item.source_only);

  if (!user?.is_superuser) {
    return <div className='container'><div className='card'><h2 style={{ marginTop: 0 }}>Reglas técnicas</h2><div className='muted'>Solo disponible para superusuario.</div></div></div>;
  }

  const fields = Array.isArray(fieldDraft?.fields) ? fieldDraft.fields : [];
  const rules = Array.isArray(ruleDraft?.rules) ? ruleDraft.rules : [];

  return (
    <div className='container'>
      <div className='card'>
        <h2 style={{ marginTop: 0 }}>Campos dinámicos de medición</h2>
        <div className='muted'>Ahora también podés tomar datos del presupuesto o del usuario logeado para autocompletar campos.</div>
        <div className='spacer' />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button onClick={() => setFieldDraft((prev) => ({ fields: [...(prev.fields || []), newField((prev.fields || []).length + 1)] }))}>+ Agregar campo</Button>
          <Button
            variant='primary'
            disabled={savingFields}
            onClick={async () => {
              setSavingFields(true);
              try {
                const payload = {
                  fields: fields
                    .map((field, index) => ({
                      key: String(field.key || '').trim(),
                      label: String(field.label || '').trim(),
                      type: String(field.type || 'text').trim().toLowerCase(),
                      section: String(field.section || 'otros').trim().toLowerCase(),
                      options: parseOptions(field.optionsText),
                      active: field.active !== false,
                      required: field.required === true,
                      value_source_type: String(field.value_source_type || 'manual').trim(),
                      value_source_path: String(field.value_source_path || '').trim(),
                      sort_order: index + 1,
                    }))
                    .filter((field) => field.key && field.label),
                };
                const saved = await adminSaveTechnicalMeasurementFieldDefinitions(payload);
                setFieldDraft({ fields: (saved.fields || []).map((field, index) => normalizeFieldDraft(field, index)) });
                window.alert('Campos guardados.');
              } finally {
                setSavingFields(false);
              }
            }}
          >
            {savingFields ? 'Guardando...' : 'Guardar campos'}
          </Button>
        </div>
      </div>

      <div className='spacer' />
      <div className='card'>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {fields.map((field, index) => (
            <div key={`${field.key || 'field'}-${index}`} style={{ border: '1px solid #eee', borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <div style={{ fontWeight: 800 }}>Campo #{index + 1}</div>
                <Button variant='ghost' onClick={() => setFieldDraft((prev) => ({ fields: (prev.fields || []).filter((_, i) => i !== index) }))}>✕</Button>
              </div>

              <div className='spacer' />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                <div>
                  <div className='muted' style={{ marginBottom: 6 }}>Clave interna</div>
                  <Input value={field.key || ''} onChange={(v) => setFieldDraft((prev) => {
                    const next = [...(prev.fields || [])];
                    next[index] = { ...next[index], key: v.replace(/\s+/g, '_').toLowerCase() };
                    return { fields: next };
                  })} placeholder='automatizacion' style={{ width: '100%' }} />
                </div>
                <div>
                  <div className='muted' style={{ marginBottom: 6 }}>Etiqueta</div>
                  <Input value={field.label || ''} onChange={(v) => setFieldDraft((prev) => {
                    const next = [...(prev.fields || [])];
                    next[index] = { ...next[index], label: v };
                    return { fields: next };
                  })} placeholder='Automatización' style={{ width: '100%' }} />
                </div>
                <div>
                  <div className='muted' style={{ marginBottom: 6 }}>Tipo</div>
                  <select value={field.type || 'text'} onChange={(e) => setFieldDraft((prev) => {
                    const next = [...(prev.fields || [])];
                    next[index] = { ...next[index], type: e.target.value };
                    return { fields: next };
                  })} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #ddd' }}>
                    <option value='text'>Texto</option>
                    <option value='number'>Número</option>
                    <option value='boolean'>Sí / No</option>
                    <option value='enum'>Lista cerrada</option>
                  </select>
                </div>
                <div>
                  <div className='muted' style={{ marginBottom: 6 }}>Sector</div>
                  <select value={field.section || 'otros'} onChange={(e) => setFieldDraft((prev) => {
                    const next = [...(prev.fields || [])];
                    next[index] = { ...next[index], section: e.target.value };
                    return { fields: next };
                  })} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #ddd' }}>
                    {SECTION_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                <div>
                  <div className='muted' style={{ marginBottom: 6 }}>Opciones (coma)</div>
                  <Input value={field.optionsText || ''} onChange={(v) => setFieldDraft((prev) => {
                    const next = [...(prev.fields || [])];
                    next[index] = { ...next[index], optionsText: v };
                    return { fields: next };
                  })} placeholder='si, no' style={{ width: '100%' }} disabled={field.type !== 'enum'} />
                </div>
              </div>

              <div className='spacer' />
              <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Origen del valor</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                  <div>
                    <div className='muted' style={{ marginBottom: 6 }}>Cómo se completa</div>
                    <select value={field.value_source_type || 'manual'} onChange={(e) => setFieldDraft((prev) => {
                      const next = [...(prev.fields || [])];
                      next[index] = { ...next[index], value_source_type: e.target.value, value_source_path: '' };
                      return { fields: next };
                    })} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #ddd' }}>
                      {VALUE_SOURCE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                  {field.value_source_type === 'fixed_value' && (
                    <div>
                      <div className='muted' style={{ marginBottom: 6 }}>Valor fijo</div>
                      <Input value={field.value_source_path || ''} onChange={(v) => setFieldDraft((prev) => {
                        const next = [...(prev.fields || [])];
                        next[index] = { ...next[index], value_source_path: v };
                        return { fields: next };
                      })} style={{ width: '100%' }} />
                    </div>
                  )}
                  {field.value_source_type === 'quote_field' && (
                    <div>
                      <div className='muted' style={{ marginBottom: 6 }}>Dato del presupuesto</div>
                      <select value={field.value_source_path || ''} onChange={(e) => setFieldDraft((prev) => {
                        const next = [...(prev.fields || [])];
                        next[index] = { ...next[index], value_source_path: e.target.value };
                        return { fields: next };
                      })} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #ddd' }}>
                        <option value=''>Seleccione…</option>
                        {QUOTE_CONTEXT_SOURCE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>
                  )}
                  {field.value_source_type === 'current_user_field' && (
                    <div>
                      <div className='muted' style={{ marginBottom: 6 }}>Dato del usuario logeado</div>
                      <select value={field.value_source_path || ''} onChange={(e) => setFieldDraft((prev) => {
                        const next = [...(prev.fields || [])];
                        next[index] = { ...next[index], value_source_path: e.target.value };
                        return { fields: next };
                      })} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #ddd' }}>
                        <option value=''>Seleccione…</option>
                        {USER_CONTEXT_SOURCE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              <div className='spacer' />
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type='checkbox' checked={field.required === true} onChange={(e) => setFieldDraft((prev) => {
                    const next = [...(prev.fields || [])];
                    next[index] = { ...next[index], required: e.target.checked };
                    return { fields: next };
                  })} />
                  <span className='muted'>Obligatorio</span>
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type='checkbox' checked={field.active !== false} onChange={(e) => setFieldDraft((prev) => {
                    const next = [...(prev.fields || [])];
                    next[index] = { ...next[index], active: e.target.checked };
                    return { fields: next };
                  })} />
                  <span className='muted'>Activo</span>
                </label>
              </div>
            </div>
          ))}
          {!fields.length && <div className='muted'>Todavía no hay campos dinámicos cargados.</div>}
        </div>
      </div>

      <div className='spacer' />
      <div className='card'>
        <h2 style={{ marginTop: 0 }}>Reglas de dependencia y Odoo</h2>
        <div className='muted'>En Campo origen ahora aparecen también propiedades del presupuesto y del usuario logeado.</div>
        <div className='spacer' />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button onClick={() => setRuleDraft((prev) => ({ rules: [...(prev.rules || []), newRule((prev.rules || []).length + 1)] }))}>+ Agregar regla</Button>
          <Button
            variant='primary'
            disabled={savingRules}
            onClick={async () => {
              setSavingRules(true);
              try {
                const payload = {
                  rules: rules
                    .map((rule, index) => ({
                      id: rule.id || `rule_${index + 1}`,
                      name: String(rule.name || '').trim(),
                      active: rule.active !== false,
                      source_key: String(rule.source_key || '').trim(),
                      operator: String(rule.operator || '='),
                      compare_value: rule.compare_value ?? '',
                      action_type: String(rule.action_type || 'set_value'),
                      target_field: String(rule.target_field || '').trim(),
                      target_value: rule.target_value ?? '',
                      target_options: parseOptions(rule.target_options_text || '').map((item) => item.value),
                      apply_to_odoo: rule.apply_to_odoo === true,
                      product_id: Number(rule.product_id || 0) || null,
                      product_label: String(rule.product_label || '').trim(),
                      sort_order: index + 1,
                    }))
                    .filter((rule) => rule.source_key),
                };
                const saved = await adminSaveTechnicalMeasurementRules(payload);
                setRuleDraft({ rules: (saved.rules || []).map((rule, index) => normalizeRuleDraft(rule, index)) });
                window.alert('Reglas guardadas.');
              } finally {
                setSavingRules(false);
              }
            }}
          >
            {savingRules ? 'Guardando...' : 'Guardar reglas'}
          </Button>
        </div>
      </div>

      <div className='spacer' />
      <div className='card'>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {rules.map((rule, index) => (
            <div key={rule.id || index} style={{ border: '1px solid #eee', borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <div style={{ fontWeight: 800 }}>Regla #{index + 1}</div>
                <Button variant='ghost' onClick={() => setRuleDraft((prev) => ({ rules: (prev.rules || []).filter((_, i) => i !== index) }))}>✕</Button>
              </div>
              <div className='spacer' />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                <div><div className='muted' style={{ marginBottom: 6 }}>Nombre</div><Input value={rule.name || ''} onChange={(v) => setRuleDraft((prev) => { const next = [...(prev.rules || [])]; next[index] = { ...next[index], name: v }; return { rules: next }; })} style={{ width: '100%' }} /></div>
                <div><div className='muted' style={{ marginBottom: 6 }}>Campo origen</div><select value={rule.source_key || ''} onChange={(e) => setRuleDraft((prev) => { const next = [...(prev.rules || [])]; next[index] = { ...next[index], source_key: e.target.value }; return { rules: next }; })} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #ddd' }}><option value=''>Seleccione campo…</option>{sourceFieldOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></div>
                <div><div className='muted' style={{ marginBottom: 6 }}>Operador</div><select value={rule.operator || '='} onChange={(e) => setRuleDraft((prev) => { const next = [...(prev.rules || [])]; next[index] = { ...next[index], operator: e.target.value }; return { rules: next }; })} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #ddd' }}>{TECHNICAL_RULE_OPERATORS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
                <div><div className='muted' style={{ marginBottom: 6 }}>Comparar contra</div><Input value={rule.compare_value ?? ''} onChange={(v) => setRuleDraft((prev) => { const next = [...(prev.rules || [])]; next[index] = { ...next[index], compare_value: v }; return { rules: next }; })} style={{ width: '100%' }} /></div>
              </div>
              <div className='spacer' />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                <div><div className='muted' style={{ marginBottom: 6 }}>Acción</div><select value={rule.action_type || 'set_value'} onChange={(e) => setRuleDraft((prev) => { const next = [...(prev.rules || [])]; next[index] = { ...next[index], action_type: e.target.value }; return { rules: next }; })} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #ddd' }}>{TECHNICAL_RULE_ACTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
                <div><div className='muted' style={{ marginBottom: 6 }}>Campo destino</div><select value={rule.target_field || ''} onChange={(e) => setRuleDraft((prev) => { const next = [...(prev.rules || [])]; next[index] = { ...next[index], target_field: e.target.value }; return { rules: next }; })} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #ddd' }}><option value=''>Seleccione campo…</option>{targetFieldOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></div>
                <div><div className='muted' style={{ marginBottom: 6 }}>Valor destino</div><Input value={rule.target_value ?? ''} onChange={(v) => setRuleDraft((prev) => { const next = [...(prev.rules || [])]; next[index] = { ...next[index], target_value: v }; return { rules: next }; })} style={{ width: '100%' }} disabled={rule.action_type === 'show_field' || rule.action_type === 'hide_field'} /></div>
                <div><div className='muted' style={{ marginBottom: 6 }}>Opciones permitidas (coma)</div><Input value={rule.target_options_text ?? ''} onChange={(v) => setRuleDraft((prev) => { const next = [...(prev.rules || [])]; next[index] = { ...next[index], target_options_text: v }; return { rules: next }; })} style={{ width: '100%' }} disabled={rule.action_type !== 'allow_options'} /></div>
              </div>
              <div className='spacer' />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                <div><label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type='checkbox' checked={rule.apply_to_odoo === true} onChange={(e) => setRuleDraft((prev) => { const next = [...(prev.rules || [])]; next[index] = { ...next[index], apply_to_odoo: e.target.checked }; return { rules: next }; })} /><span className='muted'>Pegarlo a Odoo</span></label></div>
                <div><div className='muted' style={{ marginBottom: 6 }}>Producto Odoo</div><select value={rule.product_id || ''} onChange={(e) => setRuleDraft((prev) => { const next = [...(prev.rules || [])]; const product = products.find((item) => Number(item.id) === Number(e.target.value)); next[index] = { ...next[index], product_id: e.target.value ? Number(e.target.value) : '', product_label: product ? productLabel(product) : '' }; return { rules: next }; })} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #ddd' }}><option value=''> (sin producto)</option>{products.map((product) => <option key={product.id} value={product.id}>{productLabel(product)}</option>)}</select></div>
                <div><label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type='checkbox' checked={rule.active !== false} onChange={(e) => setRuleDraft((prev) => { const next = [...(prev.rules || [])]; next[index] = { ...next[index], active: e.target.checked }; return { rules: next }; })} /><span className='muted'>Regla activa</span></label></div>
              </div>
            </div>
          ))}
          {!rules.length && <div className='muted'>Todavía no hay reglas técnicas configuradas.</div>}
        </div>
      </div>
    </div>
  );
}
