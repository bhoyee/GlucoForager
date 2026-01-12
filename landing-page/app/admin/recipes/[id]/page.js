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
  const [message, setMessage] = useState('');

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
      const data = await response.json();
      if (!response.ok) {
        alert(data.detail || 'Unable to load recipe.');
        return;
      }
      setInitialData({
        name: data.name || '',
        meal_type: data.meal_type || 'breakfast',
        description: data.description || '',
        prep_time_minutes: data.prep_time_minutes ?? '',
        cook_time_minutes: data.cook_time_minutes ?? '',
        servings: data.servings ?? '',
        image_url: data.image_url || '',
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
    const data = await response.json();
    if (!response.ok) {
      alert(data.detail || 'Upload failed.');
      return null;
    }
    return data.url;
  };

  const handleSubmit = async (formState) => {
    if (!token) {
      router.push('/admin');
      return;
    }
    if (!formState.image_url) {
      setMessage('Please provide an image URL or upload an image.');
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
        calories: Number(formState.nutrition.calories) || 0,
        carbs: Number(formState.nutrition.carbs) || 0,
        protein: Number(formState.nutrition.protein) || 0,
        fat: Number(formState.nutrition.fat) || 0,
        fiber: Number(formState.nutrition.fiber) || 0,
        sugar: Number(formState.nutrition.sugar) || 0,
      },
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
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.detail || 'Failed to update recipe.');
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(false);
    setMessage('Recipe updated successfully.');
    router.push('/admin/recipes');
  };

  if (!initialData) {
    return <div className="admin-card">Loading recipe...</div>;
  }

  return (
    <div className="admin-card">
      <h2 className="admin-title">Edit recipe</h2>
      <p className="admin-subtitle">Update details for this recipe.</p>
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
