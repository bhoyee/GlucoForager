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

  const [isUploading, setIsUploading] = useState(false);

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
    
    setIsUploading(true);
    const url = await onUpload(file);
    setIsUploading(false);
    
    if (url) {
      setFormState({ ...formState, image_url: url });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="admin-recipe-form">
      {/* Recipe Name */}
      <div className="admin-field">
        <label className="admin-field-label">
          Meal name <span className="admin-required">*</span>
        </label>
        <input
          type="text"
          value={formState.name}
          onChange={(event) => setFormState({ ...formState, name: event.target.value })}
          placeholder="e.g., Greek Yogurt Bowl"
          required
          className="admin-form-input"
        />
      </div>

      {/* Meal Type and Servings - Responsive Row */}
      <div className="admin-form-row">
        <div className="admin-field">
          <label className="admin-field-label">Meal type</label>
          <select
            value={formState.meal_type}
            onChange={(event) => setFormState({ ...formState, meal_type: event.target.value })}
            className="admin-form-select"
          >
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
          </select>
        </div>
        
        <div className="admin-field">
          <label className="admin-field-label">Servings</label>
          <input
            type="number"
            min="1"
            value={formState.servings}
            onChange={(event) => setFormState({ ...formState, servings: event.target.value })}
            placeholder="4"
            className="admin-form-input"
          />
        </div>
      </div>

      {/* Prep and Cook Times - Responsive Row */}
      <div className="admin-form-row">
        <div className="admin-field">
          <label className="admin-field-label">Prep time (min)</label>
          <input
            type="number"
            min="0"
            value={formState.prep_time_minutes}
            onChange={(event) => setFormState({ ...formState, prep_time_minutes: event.target.value })}
            placeholder="15"
            className="admin-form-input"
          />
        </div>
        
        <div className="admin-field">
          <label className="admin-field-label">Cook time (min)</label>
          <input
            type="number"
            min="0"
            value={formState.cook_time_minutes}
            onChange={(event) => setFormState({ ...formState, cook_time_minutes: event.target.value })}
            placeholder="30"
            className="admin-form-input"
          />
        </div>
      </div>

      {/* Image Section */}
      <div className="admin-form-section">
        <h3 className="admin-form-section-title">Recipe Image</h3>
        
        {/* Image URL */}
        <div className="admin-field">
          <label className="admin-field-label">Image URL</label>
          <input
            type="url"
            value={formState.image_url}
            onChange={(event) => setFormState({ ...formState, image_url: event.target.value })}
            placeholder="https://example.com/image.jpg"
            className="admin-form-input"
          />
        </div>

        {/* Image Upload */}
        <div className="admin-field">
          <label className="admin-field-label">Upload image</label>
          <div className="admin-image-upload-wrapper">
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleUpload} 
              className="admin-image-input"
              id="recipe-image-upload"
            />
            <label htmlFor="recipe-image-upload" className="admin-image-upload-button">
              {isUploading ? 'Uploading...' : 'Choose File'}
            </label>
            {formState.image_url && !isUploading && (
              <span className="admin-image-upload-status">✓ Image ready</span>
            )}
          </div>
        </div>

        {/* Image Preview */}
        {formState.image_url && (
          <div className="admin-field">
            <label className="admin-field-label">Preview</label>
            <div className="admin-image-preview">
              <img
                src={formState.image_url}
                alt="Recipe preview"
                className="admin-image-preview-img"
                onError={(e) => {
                  e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmNWYyIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCxzYW5zLXNlcmlmIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOWNhOGExIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+SW1hZ2UgTm90IEF2YWlsYWJsZTwvdGV4dD48L3N2Zz4=';
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="admin-field">
        <label className="admin-field-label">Description</label>
        <textarea
          value={formState.description}
          onChange={(event) => setFormState({ ...formState, description: event.target.value })}
          placeholder="A brief description of this delicious recipe..."
          rows="4"
          className="admin-form-textarea"
        />
      </div>

      {/* Ingredients Section */}
      <div className="admin-form-section">
        <div className="admin-section-header">
          <h3 className="admin-form-section-title">Ingredients</h3>
          <button 
            type="button" 
            className="admin-button secondary admin-button-small" 
            onClick={addIngredient}
          >
            + Add Ingredient
          </button>
        </div>
        
        <div className="admin-ingredients-grid">
          {formState.ingredients.map((ingredient, index) => (
            <div key={`ingredient-${index}`} className="admin-ingredient-card">
              <div className="admin-ingredient-header">
                <span className="admin-ingredient-number">#{index + 1}</span>
                {formState.ingredients.length > 1 && (
                  <button
                    type="button"
                    className="admin-button danger admin-button-icon"
                    onClick={() => removeIngredient(index)}
                    aria-label="Remove ingredient"
                  >
                    ×
                  </button>
                )}
              </div>
              
              <div className="admin-ingredient-fields">
                <div className="admin-field">
                  <label className="admin-field-label-small">Ingredient name</label>
                  <input
                    placeholder="e.g., Greek yogurt"
                    value={ingredient.name}
                    onChange={(event) => handleIngredientChange(index, 'name', event.target.value)}
                    className="admin-form-input admin-form-input-small"
                  />
                </div>
                
                <div className="admin-ingredient-quantity-row">
                  <div className="admin-field">
                    <label className="admin-field-label-small">Quantity</label>
                    <input
                      placeholder="1"
                      value={ingredient.quantity}
                      onChange={(event) => handleIngredientChange(index, 'quantity', event.target.value)}
                      className="admin-form-input admin-form-input-small"
                    />
                  </div>
                  
                  <div className="admin-field">
                    <label className="admin-field-label-small">Unit</label>
                    <input
                      placeholder="cup"
                      value={ingredient.unit}
                      onChange={(event) => handleIngredientChange(index, 'unit', event.target.value)}
                      className="admin-form-input admin-form-input-small"
                    />
                  </div>
                </div>
                
                <div className="admin-field">
                  <label className="admin-field-label-small">Note (optional)</label>
                  <input
                    placeholder="e.g., plain, non-fat"
                    value={ingredient.note}
                    onChange={(event) => handleIngredientChange(index, 'note', event.target.value)}
                    className="admin-form-input admin-form-input-small"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div className="admin-field">
        <label className="admin-field-label">
          Instructions <span className="admin-required">*</span>
        </label>
        <textarea
          value={formState.instructions}
          onChange={(event) => setFormState({ ...formState, instructions: event.target.value })}
          placeholder="Enter each step on a new line...
1. Mix ingredients in a bowl
2. Cook for 10 minutes
3. Serve hot"
          rows="8"
          required
          className="admin-form-textarea"
        />
      </div>

      {/* Nutrition Section */}
      <div className="admin-form-section">
        <h3 className="admin-form-section-title">Nutrition Information</h3>
        
        <div className="admin-nutrition-grid">
          <div className="admin-field">
            <label className="admin-field-label">
              Calories <span className="admin-required">*</span>
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={formState.nutrition.calories}
              required
              onChange={(event) =>
                setFormState({
                  ...formState,
                  nutrition: { ...formState.nutrition, calories: event.target.value },
                })
              }
              placeholder="250"
              className="admin-form-input"
            />
          </div>
          
          <div className="admin-field">
            <label className="admin-field-label">Carbs (g)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={formState.nutrition.carbs}
              onChange={(event) =>
                setFormState({
                  ...formState,
                  nutrition: { ...formState.nutrition, carbs: event.target.value },
                })
              }
              placeholder="30"
              className="admin-form-input"
            />
          </div>
          
          <div className="admin-field">
            <label className="admin-field-label">Protein (g)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={formState.nutrition.protein}
              onChange={(event) =>
                setFormState({
                  ...formState,
                  nutrition: { ...formState.nutrition, protein: event.target.value },
                })
              }
              placeholder="20"
              className="admin-form-input"
            />
          </div>
          
          <div className="admin-field">
            <label className="admin-field-label">Fat (g)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={formState.nutrition.fat}
              onChange={(event) =>
                setFormState({
                  ...formState,
                  nutrition: { ...formState.nutrition, fat: event.target.value },
                })
              }
              placeholder="8"
              className="admin-form-input"
            />
          </div>
          
          <div className="admin-field">
            <label className="admin-field-label">Fiber (g)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={formState.nutrition.fiber}
              onChange={(event) =>
                setFormState({
                  ...formState,
                  nutrition: { ...formState.nutrition, fiber: event.target.value },
                })
              }
              placeholder="5"
              className="admin-form-input"
            />
          </div>
          
          <div className="admin-field">
            <label className="admin-field-label">Sugar (g)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={formState.nutrition.sugar}
              onChange={(event) =>
                setFormState({
                  ...formState,
                  nutrition: { ...formState.nutrition, sugar: event.target.value },
                })
              }
              placeholder="12"
              className="admin-form-input"
            />
          </div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="admin-form-actions">
        <button 
          className="admin-button secondary admin-form-cancel" 
          type="button"
          onClick={() => window.history.back()}
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button 
          className="admin-button admin-form-submit" 
          type="submit" 
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving...' : 'Save Recipe'}
        </button>
      </div>
    </form>
  );
}