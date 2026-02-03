'use client';

import { useState } from 'react';

const emptyIngredient = { name: '', quantity: '', unit: '', note: '' };

export default function RecipeForm({ initialData, onSubmit, onUpload, isSubmitting }) {
  const [formState, setFormState] = useState(
    initialData || {
      name: '',
      meal_type: 'breakfast',
      description: '',
      prep_time_minutes: '',
      cook_time_minutes: '',
      servings: '',
      image_url: '',
      ingredients: [emptyIngredient],
      instructions: '',
      nutrition: {
        calories: '',
        carbs: '',
        protein: '',
        fat: '',
        fiber: '',
        sugar: '',
      },
    }
  );

  const handleIngredientChange = (index, field, value) => {
    const updated = [...formState.ingredients];
    updated[index] = { ...updated[index], [field]: value };
    setFormState({ ...formState, ingredients: updated });
  };

  const addIngredient = () => {
    setFormState({ ...formState, ingredients: [...formState.ingredients, emptyIngredient] });
  };

  const removeIngredient = (index) => {
    const updated = formState.ingredients.filter((_, idx) => idx !== index);
    setFormState({ ...formState, ingredients: updated.length ? updated : [emptyIngredient] });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit(formState, setFormState);
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = await onUpload(file);
    if (url) {
      setFormState({ ...formState, image_url: url });
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="admin-field">
        <label>Meal name</label>
        <input
          type="text"
          value={formState.name}
          onChange={(event) => setFormState({ ...formState, name: event.target.value })}
          required
        />
      </div>

      <div className="admin-inline">
        <div className="admin-field">
          <label>Meal type</label>
          <select
            value={formState.meal_type}
            onChange={(event) => setFormState({ ...formState, meal_type: event.target.value })}
          >
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
          </select>
        </div>
        <div className="admin-field">
          <label>Servings</label>
          <input
            type="number"
            value={formState.servings}
            onChange={(event) => setFormState({ ...formState, servings: event.target.value })}
          />
        </div>
      </div>

      <div className="admin-inline">
        <div className="admin-field">
          <label>Prep time (min)</label>
          <input
            type="number"
            value={formState.prep_time_minutes}
            onChange={(event) => setFormState({ ...formState, prep_time_minutes: event.target.value })}
          />
        </div>
        <div className="admin-field">
          <label>Cook time (min)</label>
          <input
            type="number"
            value={formState.cook_time_minutes}
            onChange={(event) => setFormState({ ...formState, cook_time_minutes: event.target.value })}
          />
        </div>
      </div>

      <div className="admin-field">
        <label>Image URL (optional if you upload)</label>
        <input
          type="url"
          value={formState.image_url}
          onChange={(event) => setFormState({ ...formState, image_url: event.target.value })}
        />
      </div>

      <div className="admin-field">
        <label>Upload image (dev only)</label>
        <input type="file" accept="image/*" onChange={handleUpload} />
      </div>

      {formState.image_url && (
        <div className="admin-field">
          <label>Image preview</label>
          <img
            src={formState.image_url}
            alt="Recipe preview"
            style={{
              width: '100%',
              maxHeight: '220px',
              objectFit: 'cover',
              borderRadius: '12px',
              border: '1px solid #e5eee9',
            }}
          />
        </div>
      )}

      <div className="admin-field">
        <label>Description</label>
        <textarea
          value={formState.description}
          onChange={(event) => setFormState({ ...formState, description: event.target.value })}
        />
      </div>

      <div className="admin-ingredients">
        <label>Ingredients</label>
        {formState.ingredients.map((ingredient, index) => (
          <div key={`ingredient-${index}`} className="admin-ingredient-row">
            <input
              placeholder="Ingredient"
              value={ingredient.name}
              onChange={(event) => handleIngredientChange(index, 'name', event.target.value)}
            />
            <input
              placeholder="Qty"
              value={ingredient.quantity}
              onChange={(event) => handleIngredientChange(index, 'quantity', event.target.value)}
            />
            <input
              placeholder="Unit"
              value={ingredient.unit}
              onChange={(event) => handleIngredientChange(index, 'unit', event.target.value)}
            />
            <input
              placeholder="Note"
              value={ingredient.note}
              onChange={(event) => handleIngredientChange(index, 'note', event.target.value)}
            />
            <button
              type="button"
              className="admin-button secondary"
              onClick={() => removeIngredient(index)}
            >
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="admin-button secondary" onClick={addIngredient}>
          Add ingredient
        </button>
      </div>

      <div className="admin-field">
        <label>Instructions (one per line)</label>
        <textarea
          value={formState.instructions}
          onChange={(event) => setFormState({ ...formState, instructions: event.target.value })}
        />
      </div>

      <div className="admin-inline">
        <div className="admin-field">
          <label>Calories</label>
          <input
            type="number"
            step="0.1"
            value={formState.nutrition.calories}
            required
            onChange={(event) =>
              setFormState({
                ...formState,
                nutrition: { ...formState.nutrition, calories: event.target.value },
              })
            }
          />
        </div>
        <div className="admin-field">
          <label>Carbs (g)</label>
          <input
            type="number"
            step="0.1"
            value={formState.nutrition.carbs}
            onChange={(event) =>
              setFormState({
                ...formState,
                nutrition: { ...formState.nutrition, carbs: event.target.value },
              })
            }
          />
        </div>
        <div className="admin-field">
          <label>Protein (g)</label>
          <input
            type="number"
            step="0.1"
            value={formState.nutrition.protein}
            onChange={(event) =>
              setFormState({
                ...formState,
                nutrition: { ...formState.nutrition, protein: event.target.value },
              })
            }
          />
        </div>
      </div>

      <div className="admin-inline">
        <div className="admin-field">
          <label>Fat (g)</label>
          <input
            type="number"
            step="0.1"
            value={formState.nutrition.fat}
            onChange={(event) =>
              setFormState({
                ...formState,
                nutrition: { ...formState.nutrition, fat: event.target.value },
              })
            }
          />
        </div>
        <div className="admin-field">
          <label>Fiber (g)</label>
          <input
            type="number"
            step="0.1"
            value={formState.nutrition.fiber}
            onChange={(event) =>
              setFormState({
                ...formState,
                nutrition: { ...formState.nutrition, fiber: event.target.value },
              })
            }
          />
        </div>
        <div className="admin-field">
          <label>Sugar (g)</label>
          <input
            type="number"
            step="0.1"
            value={formState.nutrition.sugar}
            onChange={(event) =>
              setFormState({
                ...formState,
                nutrition: { ...formState.nutrition, sugar: event.target.value },
              })
            }
          />
        </div>
      </div>

      <div className="admin-actions">
        <button className="admin-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save recipe'}
        </button>
      </div>
    </form>
  );
}
