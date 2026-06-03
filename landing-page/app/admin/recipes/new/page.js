'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import RecipeForm from '../RecipeForm';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export default function NewRecipePage() {
  const router = useRouter();
  const token = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    if (!formState.image_url?.trim()) missing.push('image');
    const hasIngredient = formState.ingredients?.some((item) => item.name?.trim());
    if (!hasIngredient) missing.push('at least one ingredient');
    if (!formState.instructions?.trim()) missing.push('instructions');
    if (!`${formState.nutrition?.calories ?? ''}`.trim()) missing.push('calories');
    return missing;
  };

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

  const handleSubmit = async (formState, setFormState) => {
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
    };

    const response = await fetch(`${API_URL}/api/admin/recipes`, {
      method: 'POST',
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
      setMessage(errorMessage || 'Failed to create recipe.');
      setIsSubmitting(false);
      return;
    }
    await response.json().catch(() => null);
    setIsSubmitting(false);
    setMessage('Recipe created successfully.');
    router.push('/admin/recipes');
  };

  return (
    <div className="admin-card">
      <h2 className="admin-title">Create recipe</h2>
      <p className="admin-subtitle">Add a new recipe for suggestions.</p>
      {message && <p className="admin-subtitle">{message}</p>}
      <RecipeForm onSubmit={handleSubmit} onUpload={uploadImage} isSubmitting={isSubmitting} />
    </div>
  );
}
