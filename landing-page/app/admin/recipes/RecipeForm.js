'use client';

import { useState } from 'react';

const emptyIngredient = { name: '', quantity: '', unit: '', note: '' };
const DEFAULT_METADATA = {
  cuisine_tags: [],
  dietary_tags: [],
  allergen_tags: [],
  food_exclusion_tags: [],
  goal_tags: [],
  equipment_tags: [],
  diabetes_type_tags: [],
  cook_time_tag: '',
};

const METADATA_GROUPS = [
  {
    field: 'cuisine_tags',
    title: 'Cuisine fit',
    options: [
      ['west_african', 'West African'],
      ['british_irish', 'British / Irish'],
      ['caribbean', 'Caribbean'],
      ['mediterranean', 'Mediterranean'],
      ['south_asian', 'South Asian'],
      ['east_asian', 'East Asian'],
      ['latin_american', 'Latin American'],
      ['mena', 'Middle Eastern / North African'],
    ],
  },
  {
    field: 'dietary_tags',
    title: 'Dietary fit',
    options: [
      ['vegetarian', 'Vegetarian'],
      ['vegan', 'Vegan'],
      ['pescatarian', 'Pescatarian'],
      ['halal', 'Halal'],
      ['kosher', 'Kosher'],
    ],
  },
  {
    field: 'goal_tags',
    title: 'User goals',
    options: [
      ['lower_carb', 'Lower carb'],
      ['high_protein', 'High protein'],
      ['quick_meals', 'Quick meal'],
      ['simple_ingredients', 'Simple ingredients'],
      ['weight_loss', 'Weight loss'],
      ['balanced', 'Balanced'],
    ],
  },
  {
    field: 'equipment_tags',
    title: 'Equipment',
    options: [
      ['air_fryer', 'Air fryer'],
      ['blender', 'Blender'],
      ['microwave', 'Microwave'],
      ['oven', 'Oven'],
      ['stovetop', 'Stovetop'],
      ['grill', 'Grill'],
      ['slow_cooker', 'Slow cooker'],
    ],
  },
  {
    field: 'diabetes_type_tags',
    title: 'Diabetes profile',
    options: [
      ['type_1', 'Type 1'],
      ['type_2', 'Type 2'],
      ['prediabetes', 'Prediabetes'],
      ['gestational', 'Gestational'],
    ],
  },
  {
    field: 'allergen_tags',
    title: 'Allergens present',
    options: [
      ['dairy', 'Dairy'],
      ['eggs', 'Eggs'],
      ['fish', 'Fish'],
      ['shellfish', 'Shellfish'],
      ['peanuts', 'Peanuts'],
      ['tree_nuts', 'Tree nuts'],
      ['soy', 'Soy'],
      ['wheat_gluten', 'Wheat / gluten'],
      ['sesame', 'Sesame'],
    ],
  },
  {
    field: 'food_exclusion_tags',
    title: 'Avoid-list items present',
    options: [
      ['pork', 'Pork'],
      ['beef', 'Beef'],
      ['chicken', 'Chicken'],
      ['seafood', 'Seafood'],
      ['onion_garlic', 'Onion / garlic'],
      ['spicy_food', 'Spicy food'],
      ['mushrooms', 'Mushrooms'],
      ['alcohol', 'Alcohol'],
      ['caffeine', 'Caffeine'],
    ],
  },
];

const COOK_TIME_OPTIONS = [
  ['', 'Auto / not tagged'],
  ['under_15', 'Under 15 minutes'],
  ['15_30', '15-30 minutes'],
  ['30_45', '30-45 minutes'],
  ['45_plus', '45+ minutes'],
];

const MAX_RECIPE_IMAGE_BYTES = 2 * 1024 * 1024;
const RECIPE_IMAGE_MAX_DIMENSION = 1600;

const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes)) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
};

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });

const resizeRecipeImage = async (file) => {
  if (!file || file.size <= MAX_RECIPE_IMAGE_BYTES) {
    return { file, resized: false };
  }

  const supportedType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  if (!supportedType || typeof window === 'undefined' || typeof document === 'undefined') {
    return { file, resized: false };
  }

  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = imageUrl;
    });

    const scale = Math.min(1, RECIPE_IMAGE_MAX_DIMENSION / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) return { file, resized: false };
    context.drawImage(image, 0, 0, width, height);

    const outputType = file.type === 'image/png' ? 'image/jpeg' : file.type;
    const outputName = file.name.replace(/\.[^.]+$/, '') || 'recipe-image';
    const extension = outputType === 'image/webp' ? 'webp' : 'jpg';

    for (const quality of [0.86, 0.78, 0.7, 0.62, 0.54, 0.48]) {
      const blob = await canvasToBlob(canvas, outputType, quality);
      if (blob && blob.size <= MAX_RECIPE_IMAGE_BYTES) {
        return {
          file: new File([blob], `${outputName}.${extension}`, { type: outputType }),
          resized: true,
        };
      }
    }
  } finally {
    URL.revokeObjectURL(imageUrl);
  }

  return { file, resized: false };
};

export default function RecipeForm({ initialData, onSubmit, onUpload, isSubmitting }) {
  const [formState, setFormState] = useState(
    initialData
      ? { ...DEFAULT_METADATA, ...initialData }
      : {
      name: '',
      meal_type: 'breakfast',
      description: '',
      prep_time_minutes: '',
      cook_time_minutes: '',
      servings: '',
      image_url: '',
      image_prompt: '',
      status: 'published',
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
      ...DEFAULT_METADATA,
    }
  );

  const [isUploading, setIsUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState('');

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

  const toggleMetadataTag = (field, value) => {
    const current = Array.isArray(formState[field]) ? formState[field] : [];
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    setFormState({ ...formState, [field]: next });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit(formState, setFormState);
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadNote('');
    try {
      const result = await resizeRecipeImage(file);
      const uploadFile = result.file;
      if (uploadFile.size > MAX_RECIPE_IMAGE_BYTES) {
        setUploadNote(`Image is still ${formatFileSize(uploadFile.size)}. Please choose a smaller image.`);
        return;
      }

      const url = await onUpload(uploadFile);

      if (url) {
        setFormState({ ...formState, image_url: url });
        setUploadNote(
          result.resized
            ? `Image resized from ${formatFileSize(file.size)} to ${formatFileSize(uploadFile.size)} before upload.`
            : 'Image uploaded.'
        );
      }
    } catch {
      setUploadNote('Unable to resize this image. Please try a JPG, PNG, or WebP file.');
    } finally {
      setIsUploading(false);
      event.target.value = '';
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

        <div className="admin-field">
          <label className="admin-field-label">Image prompt / direction</label>
          <textarea
            value={formState.image_prompt || ''}
            onChange={(event) => setFormState({ ...formState, image_prompt: event.target.value })}
            placeholder="Describe the image needed for this recipe..."
            rows="3"
            className="admin-form-textarea"
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
              {isUploading ? 'Preparing image...' : 'Choose File'}
            </label>
            {formState.image_url && !isUploading && (
              <span className="admin-image-upload-status">✓ Image ready</span>
            )}
          </div>
          <p className="admin-field-help">
            Images larger than 2MB are automatically resized before upload when possible.
          </p>
          {uploadNote ? <p className="admin-field-help">{uploadNote}</p> : null}
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

      {/* Matching Metadata */}
      <div className="admin-form-section">
        <h3 className="admin-form-section-title">Recipe Matching Metadata</h3>
        <p className="admin-help" style={{ marginTop: -4 }}>
          These fields help the app match recipes to user preferences instead of relying only on text.
        </p>

        <div className="admin-field">
          <label className="admin-field-label">Cook time preference tag</label>
          <select
            value={formState.cook_time_tag || ''}
            onChange={(event) => setFormState({ ...formState, cook_time_tag: event.target.value })}
            className="admin-form-select"
          >
            {COOK_TIME_OPTIONS.map(([value, label]) => (
              <option key={value || 'none'} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="admin-metadata-grid">
          {METADATA_GROUPS.map((group) => (
            <fieldset key={group.field} className="admin-metadata-group">
              <legend>{group.title}</legend>
              <div className="admin-metadata-options">
                {group.options.map(([value, label]) => {
                  const selected = Array.isArray(formState[group.field]) && formState[group.field].includes(value);
                  return (
                    <label key={value} className={`admin-metadata-option ${selected ? 'selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleMetadataTag(group.field, value)}
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
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
