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

  const handleSubmit = async (formState, setFormState) => {
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
        calories: parseFloat(formState.nutrition.calories) || 0,
        carbs: parseFloat(formState.nutrition.carbs) || 0,
        protein: parseFloat(formState.nutrition.protein) || 0,
        fat: parseFloat(formState.nutrition.fat) || 0,
        fiber: parseFloat(formState.nutrition.fiber) || 0,
        sugar: parseFloat(formState.nutrition.sugar) || 0,
      },
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
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.detail || 'Failed to create recipe.');
      setIsSubmitting(false);
      return;
    }
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
