'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

const CUISINES = [
  ['west_african', 'West African'],
  ['british_irish', 'British / Irish'],
  ['caribbean', 'Caribbean'],
  ['mediterranean', 'Mediterranean'],
  ['south_asian', 'South Asian'],
  ['east_asian', 'East Asian'],
  ['latin_american', 'Latin American'],
  ['mena', 'Middle Eastern / North African'],
];

const DIETARY = [
  ['vegetarian', 'Vegetarian'],
  ['vegan', 'Vegan'],
  ['pescatarian', 'Pescatarian'],
  ['halal', 'Halal'],
  ['kosher', 'Kosher'],
];

const GOALS = [
  ['lower_carb', 'Lower carb'],
  ['high_protein', 'High protein'],
  ['quick_meals', 'Quick meals'],
  ['simple_ingredients', 'Simple ingredients'],
  ['weight_loss', 'Weight loss'],
  ['balanced', 'Balanced'],
];

const DIABETES = [
  ['type_1', 'Type 1'],
  ['type_2', 'Type 2'],
  ['prediabetes', 'Prediabetes'],
  ['gestational', 'Gestational'],
];

const EQUIPMENT = [
  ['air_fryer', 'Air fryer'],
  ['blender', 'Blender'],
  ['microwave', 'Microwave'],
  ['oven', 'Oven'],
  ['stovetop', 'Stovetop'],
  ['grill', 'Grill'],
  ['slow_cooker', 'Slow cooker'],
];

function TagPicker({ label, options, values, onChange }) {
  const selected = Array.isArray(values) ? values : [];
  const toggle = (value) => {
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  };
  return (
    <fieldset className="admin-metadata-group">
      <legend>{label}</legend>
      <div className="admin-metadata-options">
        {options.map(([value, title]) => (
          <label key={value} className={`admin-metadata-option ${selected.includes(value) ? 'selected' : ''}`}>
            <input type="checkbox" checked={selected.includes(value)} onChange={() => toggle(value)} />
            <span>{title}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function AIRecipeGeneratorPage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);
  const [form, setForm] = useState({
    count: 10,
    meal_type: '',
    cuisine_tags: [],
    dietary_tags: [],
    goal_tags: ['lower_carb', 'balanced'],
    diabetes_type_tags: ['type_2', 'prediabetes'],
    equipment_tags: [],
    cook_time_tag: '',
    notes: '',
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);

  const generate = async (event) => {
    event.preventDefault();
    if (!token) {
      router.push('/admin');
      return;
    }
    setIsGenerating(true);
    setMessage('');
    setResult(null);
    try {
      const response = await fetch(`${API_URL}/api/admin/recipes/generate-drafts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...form,
          count: Math.max(1, Math.min(30, Number(form.count) || 10)),
          meal_type: form.meal_type || null,
          cook_time_tag: form.cook_time_tag || null,
          notes: form.notes || null,
        }),
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || 'Failed to generate recipe drafts.');
      }
      setResult(data);
      setMessage(`${data.created_count || 0} recipe drafts created.`);
    } catch (error) {
      setMessage(error?.message || 'Failed to generate recipe drafts.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="admin-card">
      <div className="admin-recipes-header">
        <h2 className="admin-title">AI Recipe Studio</h2>
        <p className="admin-subtitle">Generate diabetes-friendly recipe drafts, then review, edit, upload images, and publish manually.</p>
      </div>

      {message ? <div className="admin-message">{message}</div> : null}

      <form className="admin-recipe-form" onSubmit={generate}>
        <div className="admin-form-row">
          <div className="admin-field">
            <label className="admin-field-label">Number of drafts</label>
            <input
              className="admin-form-input"
              type="number"
              min="1"
              max="30"
              value={form.count}
              onChange={(event) => setForm({ ...form, count: event.target.value })}
            />
          </div>
          <div className="admin-field">
            <label className="admin-field-label">Meal type</label>
            <select className="admin-form-select" value={form.meal_type} onChange={(event) => setForm({ ...form, meal_type: event.target.value })}>
              <option value="">Any meal type</option>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
            </select>
          </div>
        </div>

        <div className="admin-form-row">
          <div className="admin-field">
            <label className="admin-field-label">Cook time</label>
            <select className="admin-form-select" value={form.cook_time_tag} onChange={(event) => setForm({ ...form, cook_time_tag: event.target.value })}>
              <option value="">Any cook time</option>
              <option value="under_15">Under 15 minutes</option>
              <option value="15_30">15-30 minutes</option>
              <option value="30_45">30-45 minutes</option>
              <option value="45_plus">45+ minutes</option>
            </select>
          </div>
          <div className="admin-field">
            <label className="admin-field-label">Extra direction</label>
            <input
              className="admin-form-input"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="e.g., Nigerian lunch ideas, no rice, family-friendly"
            />
          </div>
        </div>

        <div className="admin-metadata-grid">
          <TagPicker label="Cuisine fit" options={CUISINES} values={form.cuisine_tags} onChange={(value) => setForm({ ...form, cuisine_tags: value })} />
          <TagPicker label="Dietary fit" options={DIETARY} values={form.dietary_tags} onChange={(value) => setForm({ ...form, dietary_tags: value })} />
          <TagPicker label="User goals" options={GOALS} values={form.goal_tags} onChange={(value) => setForm({ ...form, goal_tags: value })} />
          <TagPicker label="Diabetes profile" options={DIABETES} values={form.diabetes_type_tags} onChange={(value) => setForm({ ...form, diabetes_type_tags: value })} />
          <TagPicker label="Equipment" options={EQUIPMENT} values={form.equipment_tags} onChange={(value) => setForm({ ...form, equipment_tags: value })} />
        </div>

        <div className="admin-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="admin-button" type="submit" disabled={isGenerating}>
            {isGenerating ? 'Generating drafts...' : 'Generate Drafts'}
          </button>
          <Link className="admin-button secondary" href="/admin/recipes">
            Back to Recipes
          </Link>
        </div>
      </form>

      {result?.created?.length ? (
        <div className="admin-form-section" style={{ marginTop: 18 }}>
          <h3 className="admin-form-section-title">Generated drafts</h3>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Meal type</th>
                  <th>Safety</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {result.created.map((recipe) => (
                  <tr key={recipe.id}>
                    <td>{recipe.name}</td>
                    <td>{recipe.meal_type}</td>
                    <td>
                      {recipe.safety_flags?.length ? (
                        <span className={`admin-badge ${recipe.safety_flags.some((item) => item?.level === 'danger') ? 'danger' : 'warning'}`}>
                          Nutrition review
                        </span>
                      ) : (
                        <span className="admin-badge success">OK</span>
                      )}
                    </td>
                    <td>
                      <Link className="admin-button admin-button-small admin-button-edit" href={`/admin/recipes/${recipe.id}`}>
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.skipped_duplicates?.length ? (
            <p className="admin-help">Skipped duplicates: {result.skipped_duplicates.join(', ')}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
