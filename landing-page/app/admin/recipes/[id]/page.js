'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import RecipeForm from '../RecipeForm';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export default function EditRecipePage() {
  const router = useRouter();
  const params = useParams();
  const recipeId = params?.id;
  const token = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;

  const [initialData, setInitialData] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [message, setMessage] = useState('');

  const parseErrorResponse = async (response) => {
    try {
      const data = await response.json();
      const detail = data?.detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail)) {
        const messages = detail.map((item) => item?.msg).filter(Boolean);
        if (messages.length) return messages.join(' ');
      }
      if (detail && typeof detail === 'object') return JSON.stringify(detail);
      return data?.message || 'Request failed.';
    } catch (error) {
      try {
        const text = await response.text();
        return text || 'Request failed.';
      } catch (readError) {
        return 'Request failed.';
      }
    }
  };

  const validateRecipe = (formState) => {
    const missing = [];
    if (!formState.name?.trim()) missing.push('meal name');
    if ((formState.status || 'published') === 'published' && !formState.image_url?.trim()) missing.push('image');
    const hasIngredient = formState.ingredients?.some((item) => item.name?.trim());
    if (!hasIngredient) missing.push('at least one ingredient');
    if (!formState.instructions?.trim()) missing.push('instructions');
    if (!`${formState.nutrition?.calories ?? ''}`.trim()) missing.push('calories');
    return missing;
  };

  useEffect(() => {
    if (!token) {
      router.push('/admin');
      return;
    }
    const loadRecipe = async () => {
      const response = await fetch(`${API_URL}/api/admin/recipes/${recipeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        const errorMessage = await parseErrorResponse(response);
        alert(errorMessage || 'Unable to load recipe.');
        return;
      }
      const data = await response.json();
      setInitialData({
        name: data.name || '',
        meal_type: data.meal_type || 'breakfast',
        description: data.description || '',
        prep_time_minutes: data.prep_time_minutes ?? '',
        cook_time_minutes: data.cook_time_minutes ?? '',
        servings: data.servings ?? '',
        image_url: data.image_url || '',
        image_prompt: data.image_prompt || '',
        status: data.status || 'published',
        source: data.source || 'manual',
        safety_flags: Array.isArray(data.safety_flags) ? data.safety_flags : [],
        ingredients: data.ingredients?.length ? data.ingredients : [{ name: '', quantity: '', unit: '', note: '' }],
        instructions: Array.isArray(data.instructions) ? data.instructions.join('\n') : '',
        nutrition: {
          calories: data.nutrition?.calories ?? '',
          carbs: data.nutrition?.carbs ?? '',
          protein: data.nutrition?.protein ?? '',
          fat: data.nutrition?.fat ?? '',
          fiber: data.nutrition?.fiber ?? '',
          sugar: data.nutrition?.sugar ?? '',
        },
        cuisine_tags: Array.isArray(data.cuisine_tags) ? data.cuisine_tags : [],
        dietary_tags: Array.isArray(data.dietary_tags) ? data.dietary_tags : [],
        allergen_tags: Array.isArray(data.allergen_tags) ? data.allergen_tags : [],
        food_exclusion_tags: Array.isArray(data.food_exclusion_tags) ? data.food_exclusion_tags : [],
        goal_tags: Array.isArray(data.goal_tags) ? data.goal_tags : [],
        equipment_tags: Array.isArray(data.equipment_tags) ? data.equipment_tags : [],
        diabetes_type_tags: Array.isArray(data.diabetes_type_tags) ? data.diabetes_type_tags : [],
        cook_time_tag: data.cook_time_tag || '',
      });
    };
    loadRecipe();
  }, [recipeId, token]);

  const uploadImage = async (file) => {
    if (!token) return null;
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_URL}/api/admin/uploads`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (response.status === 401) {
      localStorage.removeItem('adminToken');
      router.push('/admin');
      return null;
    }
    if (!response.ok) {
      const errorMessage = await parseErrorResponse(response);
      alert(errorMessage || 'Upload failed.');
      return null;
    }
    const data = await response.json();
    return data.url;
  };

  const handleSubmit = async (formState) => {
    if (!token) {
      router.push('/admin');
      return;
    }
    const missingFields = validateRecipe(formState);
    if (missingFields.length) {
      setMessage(`Please provide ${missingFields.join(', ')}.`);
      return;
    }
    setIsSubmitting(true);
    setMessage('');
    const payload = {
      name: formState.name,
      meal_type: formState.meal_type,
      description: formState.description,
      prep_time_minutes: Number(formState.prep_time_minutes) || 0,
      cook_time_minutes: Number(formState.cook_time_minutes) || 0,
      servings: Number(formState.servings) || 0,
      image_url: formState.image_url,
      image_prompt: formState.image_prompt || null,
      ingredients: formState.ingredients.filter((item) => item.name.trim()),
      instructions: formState.instructions
        .split('\n')
        .map((step) => step.trim())
        .filter(Boolean),
      nutrition: {
        calories: parseFloat(formState.nutrition.calories) || 0,
        carbs: parseFloat(formState.nutrition.carbs) || 0,
        protein: parseFloat(formState.nutrition.protein) || 0,
        fat: parseFloat(formState.nutrition.fat) || 0,
        fiber: parseFloat(formState.nutrition.fiber) || 0,
        sugar: parseFloat(formState.nutrition.sugar) || 0,
      },
      cuisine_tags: Array.isArray(formState.cuisine_tags) ? formState.cuisine_tags : [],
      dietary_tags: Array.isArray(formState.dietary_tags) ? formState.dietary_tags : [],
      allergen_tags: Array.isArray(formState.allergen_tags) ? formState.allergen_tags : [],
      food_exclusion_tags: Array.isArray(formState.food_exclusion_tags) ? formState.food_exclusion_tags : [],
      goal_tags: Array.isArray(formState.goal_tags) ? formState.goal_tags : [],
      equipment_tags: Array.isArray(formState.equipment_tags) ? formState.equipment_tags : [],
      diabetes_type_tags: Array.isArray(formState.diabetes_type_tags) ? formState.diabetes_type_tags : [],
      cook_time_tag: formState.cook_time_tag || null,
      status: formState.status || 'draft',
    };

    const response = await fetch(`${API_URL}/api/admin/recipes/${recipeId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (response.status === 401) {
      localStorage.removeItem('adminToken');
      router.push('/admin');
      return;
    }
    if (!response.ok) {
      const errorMessage = await parseErrorResponse(response);
      setMessage(errorMessage || 'Failed to update recipe.');
      setIsSubmitting(false);
      return;
    }
    await response.json().catch(() => null);
    setIsSubmitting(false);
    setMessage('Recipe updated successfully.');
    router.push('/admin/recipes');
  };

  const handlePublish = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    if (!initialData?.image_url?.trim()) {
      setMessage('Upload an image before publishing this recipe.');
      return;
    }
    setIsPublishing(true);
    setMessage('');
    const response = await fetch(`${API_URL}/api/admin/recipes/${recipeId}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) {
      localStorage.removeItem('adminToken');
      router.push('/admin');
      return;
    }
    if (!response.ok) {
      const errorMessage = await parseErrorResponse(response);
      setMessage(errorMessage || 'Failed to publish recipe.');
      setIsPublishing(false);
      return;
    }
    setIsPublishing(false);
    router.push('/admin/recipes');
  };

  if (!initialData) {
    return <div className="admin-card">Loading recipe...</div>;
  }

  return (
    <div className="admin-card">
      <h2 className="admin-title">Edit recipe</h2>
      <p className="admin-subtitle">Update details for this recipe.</p>
      <div className="admin-actions" style={{ justifyContent: 'flex-start', marginBottom: 12 }}>
        <span className={`admin-badge ${initialData.status === 'published' ? 'success' : 'warning'}`}>
          {initialData.status === 'published' ? 'Published' : 'Draft'}
        </span>
        {initialData.source === 'ai_generated' ? <span className="admin-badge info">AI generated</span> : null}
        {initialData.safety_flags?.length ? (
          <span className={`admin-badge ${initialData.safety_flags.some((item) => item?.level === 'danger') ? 'danger' : 'warning'}`}>
            Nutrition review
          </span>
        ) : null}
        {initialData.status !== 'published' ? (
          <button className="admin-button" type="button" onClick={handlePublish} disabled={isPublishing || isSubmitting}>
            {isPublishing ? 'Publishing...' : 'Publish'}
          </button>
        ) : null}
      </div>
      {initialData.safety_flags?.length ? (
        <div className={`admin-message ${initialData.safety_flags.some((item) => item?.level === 'danger') ? 'danger' : 'warning'}`}>
          <strong>Nutrition safety review needed.</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {initialData.safety_flags.map((flag, index) => (
              <li key={`${flag?.code || 'flag'}-${index}`}>{flag?.message || flag?.code || 'Review nutrition values.'}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {message && <p className="admin-subtitle">{message}</p>}
      <RecipeForm
        initialData={initialData}
        onSubmit={handleSubmit}
        onUpload={uploadImage}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
