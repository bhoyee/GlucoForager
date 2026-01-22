'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const PAGE_SIZE = 8;

export default function AdminRecipesList() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [recipes, setRecipes] = useState([]);
  const [search, setSearch] = useState('');
  const [mealType, setMealType] = useState('all');
  const [sortKey, setSortKey] = useState('created_at');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      router.push('/admin');
      return;
    }
    loadRecipes();
  }, [token]);

  const loadRecipes = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/recipes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await response.json();
      setRecipes(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      setMessage('Failed to load recipes.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (recipeId) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/recipes/${recipeId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) throw new Error();
      setRecipes(recipes.filter((recipe) => recipe.id !== recipeId));
    } catch (error) {
      setMessage('Failed to delete recipe.');
    }
  };

  const requestDelete = (recipe) => {
    setPendingAction({ recipe });
  };

  const confirmDelete = async () => {
    if (!pendingAction?.recipe) return;
    setActionBusy(true);
    await handleDelete(pendingAction.recipe.id);
    setActionBusy(false);
    setPendingAction(null);
  };

  const filtered = recipes
    .filter((recipe) => recipe.name.toLowerCase().includes(search.toLowerCase()))
    .filter((recipe) => (mealType === 'all' ? true : recipe.meal_type === mealType))
    .sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      if (sortKey === 'meal_type') return a.meal_type.localeCompare(b.meal_type);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  return (
    <div className="admin-card">
      <h2 className="admin-title">Recipes</h2>
      <p className="admin-subtitle">Search, filter, and manage your recipes.</p>

      {message && <p className="admin-subtitle">{message}</p>}

      <div className="admin-toolbar">
        <input
          type="text"
          placeholder="Search recipes..."
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <select
          value={mealType}
          onChange={(event) => {
            setMealType(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">All meals</option>
          <option value="breakfast">Breakfast</option>
          <option value="lunch">Lunch</option>
          <option value="dinner">Dinner</option>
          <option value="snack">Snack</option>
        </select>
        <select value={sortKey} onChange={(event) => setSortKey(event.target.value)}>
          <option value="created_at">Newest first</option>
          <option value="name">Name (A-Z)</option>
          <option value="meal_type">Meal type</option>
        </select>
        <Link className="admin-button" href="/admin/recipes/new">
          Add recipe
        </Link>
      </div>

      {isLoading ? (
        <p>Loading recipes...</p>
      ) : (
        <>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Meal type</th>
                <th>Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((recipe) => (
                <tr key={recipe.id}>
                  <td>{recipe.name}</td>
                  <td>
                    <span className="admin-badge">{recipe.meal_type}</span>
                  </td>
                  <td>
                    {(recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0)} min
                  </td>
                  <td className="admin-actions">
                    <Link className="admin-button secondary" href={`/admin/recipes/${recipe.id}`}>
                      Edit
                    </Link>
                    <button
                      type="button"
                      className="admin-button danger"
                      onClick={() => requestDelete(recipe)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="admin-pagination">
            <button type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
              Prev
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
            >
              Next
            </button>
          </div>
        </>
      )}

      {pendingAction && (
        <div className="admin-modal-backdrop" role="presentation">
          <div className="admin-modal" role="dialog" aria-modal="true">
            <h3>Delete recipe</h3>
            <p>Delete {pendingAction.recipe.name} permanently? This cannot be undone.</p>
            <div className="admin-actions">
              <button
                className="admin-button secondary"
                type="button"
                onClick={() => setPendingAction(null)}
                disabled={actionBusy}
              >
                Cancel
              </button>
              <button
                className="admin-button danger"
                type="button"
                onClick={confirmDelete}
                disabled={actionBusy}
              >
                {actionBusy ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
