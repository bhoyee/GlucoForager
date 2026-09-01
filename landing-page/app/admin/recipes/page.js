'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const PAGE_SIZE = 8;
const REFRESH_MS = 20000;

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AdminRecipesList() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [recipes, setRecipes] = useState([]);
  const [search, setSearch] = useState('');
  const [mealType, setMealType] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState('created_at');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [publishingId, setPublishingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkPublishing, setBulkPublishing] = useState(false);

  useEffect(() => {
    if (!token) {
      router.push('/admin');
      return;
    }
    loadRecipes();
  }, [token]);

  const loadRecipes = async (silent = false) => {
    // The initial load shows the "Loading recipes..." state since there's nothing on
    // screen yet. Background auto-refreshes (every REFRESH_MS) update the data quietly
    // instead, so the table doesn't blank out and re-render every few seconds.
    if (!silent) setIsLoading(true);
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
      if (!silent) setMessage('Failed to load recipes.');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return undefined;
    const timer = setInterval(() => {
      loadRecipes(true);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [token]);

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

  const requestBulkDelete = () => {
    if (selectedIds.size === 0) return;
    setPendingAction({ bulk: true, ids: Array.from(selectedIds) });
  };

  const handlePublish = async (recipe) => {
    setPublishingId(recipe.id);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/recipes/${recipe.id}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || 'Failed to publish recipe.');
      }
      setRecipes((current) =>
        current.map((item) => (item.id === recipe.id ? { ...item, status: 'published' } : item))
      );
    } catch (error) {
      setMessage(error.message || 'Failed to publish recipe.');
    } finally {
      setPublishingId(null);
    }
  };

  const handleBulkDelete = async (ids) => {
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/recipes/bulk-delete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_ids: ids }),
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Failed to delete recipes.');
      const deletedSet = new Set(ids);
      setRecipes((current) => current.filter((item) => !deletedSet.has(item.id)));
      setSelectedIds((current) => {
        const next = new Set(current);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      setMessage(`Deleted ${data.deleted_count ?? ids.length} recipe(s).`);
    } catch (error) {
      setMessage(error.message || 'Failed to delete recipes.');
    }
  };

  const confirmDelete = async () => {
    if (!pendingAction) return;
    setActionBusy(true);
    if (pendingAction.bulk) {
      await handleBulkDelete(pendingAction.ids);
    } else if (pendingAction.recipe) {
      await handleDelete(pendingAction.recipe.id);
    }
    setActionBusy(false);
    setPendingAction(null);
  };

  const toggleSelected = (recipeId) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(recipeId)) next.delete(recipeId);
      else next.add(recipeId);
      return next;
    });
  };

  const handleBulkPublish = async () => {
    const draftSelectedIds = Array.from(selectedIds).filter((id) => {
      const recipe = recipes.find((item) => item.id === id);
      return (recipe?.status || 'published') === 'draft';
    });
    if (draftSelectedIds.length === 0) {
      setMessage('No draft recipes selected to publish.');
      return;
    }
    setBulkPublishing(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/recipes/bulk-publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_ids: draftSelectedIds }),
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Failed to publish recipes.');
      const publishedSet = new Set(data.published || []);
      setRecipes((current) =>
        current.map((item) => (publishedSet.has(item.id) ? { ...item, status: 'published' } : item))
      );
      setSelectedIds((current) => {
        const next = new Set(current);
        publishedSet.forEach((id) => next.delete(id));
        return next;
      });
      const failed = data.failed || [];
      if (failed.length > 0) {
        setMessage(
          `Published ${data.published_count || 0}. ${failed.length} could not be published: ` +
            failed.map((item) => `${item.name || `#${item.id}`} (${item.reason})`).join('; ')
        );
      } else {
        setMessage(`Published ${data.published_count || 0} recipe(s).`);
      }
    } catch (error) {
      setMessage(error.message || 'Failed to publish recipes.');
    } finally {
      setBulkPublishing(false);
    }
  };

  const mealCounts = useMemo(() => {
    const counts = {
      breakfast: 0,
      lunch: 0,
      dinner: 0,
      snack: 0,
      total: 0,
    };
    for (const recipe of recipes) {
      counts.total += 1;
      const key = String(recipe?.meal_type || '').toLowerCase();
      if (Object.prototype.hasOwnProperty.call(counts, key)) {
        counts[key] += 1;
      }
    }
    return counts;
  }, [recipes]);

  const statusCounts = useMemo(() => {
    const counts = { draft: 0, published: 0, archived: 0 };
    for (const recipe of recipes) {
      const key = String(recipe?.status || 'published').toLowerCase();
      if (Object.prototype.hasOwnProperty.call(counts, key)) counts[key] += 1;
    }
    return counts;
  }, [recipes]);

  const filtered = recipes
    .filter((recipe) => recipe.name.toLowerCase().includes(search.toLowerCase()))
    .filter((recipe) => (mealType === 'all' ? true : recipe.meal_type === mealType))
    .filter((recipe) => (statusFilter === 'all' ? true : (recipe.status || 'published') === statusFilter))
    .sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      if (sortKey === 'meal_type') return a.meal_type.localeCompare(b.meal_type);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const draftIdsInView = filtered
    .filter((recipe) => (recipe.status || 'published') === 'draft')
    .map((recipe) => recipe.id);
  const allDraftsInViewSelected = draftIdsInView.length > 0 && draftIdsInView.every((id) => selectedIds.has(id));

  const toggleSelectAllDrafts = () => {
    setSelectedIds((current) => {
      if (allDraftsInViewSelected) {
        const next = new Set(current);
        draftIdsInView.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...current, ...draftIdsInView]);
    });
  };

  const draftSelectedCount = Array.from(selectedIds).filter((id) => {
    const recipe = recipes.find((item) => item.id === id);
    return (recipe?.status || 'published') === 'draft';
  }).length;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  return (
    <div className="admin-card admin-recipes-container">
      <div className="admin-recipes-header">
        <h2 className="admin-title">Recipes</h2>
        <p className="admin-subtitle">Search, filter, and manage your recipes.</p>
      </div>

      <div className="admin-inline admin-subcards" style={{ marginTop: 0 }}>
        <div className="admin-subcard admin-subcard--breakfast">
          <span>Breakfast</span>
          <strong>{mealCounts.breakfast}</strong>
        </div>
        <div className="admin-subcard admin-subcard--lunch">
          <span>Lunch</span>
          <strong>{mealCounts.lunch}</strong>
        </div>
        <div className="admin-subcard admin-subcard--dinner">
          <span>Dinner</span>
          <strong>{mealCounts.dinner}</strong>
        </div>
        <div className="admin-subcard admin-subcard--snack">
          <span>Snack</span>
          <strong>{mealCounts.snack}</strong>
        </div>
      </div>

      {message && (
        <div className="admin-message">
          {message}
        </div>
      )}

      <div className="admin-recipes-toolbar">
        <div className="admin-toolbar-grid">
          <div className="admin-toolbar-search">
            <input
              type="text"
              placeholder="Search recipes..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              className="admin-search-input"
            />
          </div>
          
          <div className="admin-toolbar-filters">
            <select
              value={mealType}
              onChange={(event) => {
                setMealType(event.target.value);
                setPage(1);
              }}
              className="admin-filter-select"
            >
              <option value="all">All meals</option>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
            </select>

            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
              className="admin-filter-select"
            >
              <option value="all">All status</option>
              <option value="draft">Drafts ({statusCounts.draft})</option>
              <option value="published">Published ({statusCounts.published})</option>
              <option value="archived">Archived ({statusCounts.archived})</option>
            </select>
            
            <select 
              value={sortKey} 
              onChange={(event) => setSortKey(event.target.value)}
              className="admin-sort-select"
            >
              <option value="created_at">Newest first</option>
              <option value="name">Name (A-Z)</option>
              <option value="meal_type">Meal type</option>
            </select>
          </div>
          
          <div className="admin-toolbar-actions">
            <Link className="admin-button secondary" href="/admin/recipes/ai-generator">
              AI Recipe Studio
            </Link>
            <Link className="admin-button admin-add-button" href="/admin/recipes/new">
              Add Recipe
            </Link>
          </div>
        </div>
      </div>

      {(draftIdsInView.length > 0 || selectedIds.size > 0) && (
        <div className="admin-inline" style={{ alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
          {draftIdsInView.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
              <input type="checkbox" checked={allDraftsInViewSelected} onChange={toggleSelectAllDrafts} />
              Select all drafts in view ({draftIdsInView.length})
            </label>
          )}
          {draftSelectedCount > 0 && (
            <button
              type="button"
              className="admin-button admin-button-publish"
              onClick={handleBulkPublish}
              disabled={bulkPublishing}
            >
              {bulkPublishing ? 'Publishing...' : `Publish selected (${draftSelectedCount})`}
            </button>
          )}
          {selectedIds.size > 0 && (
            <button
              type="button"
              className="admin-button admin-button-delete"
              onClick={requestBulkDelete}
              disabled={actionBusy}
            >
              Delete selected ({selectedIds.size})
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="admin-loading-state">
          <p>Loading recipes...</p>
        </div>
      ) : (
        <>
          {/* Mobile Card View (hidden on desktop) */}
          <div className="admin-mobile-view">
            {pageItems.length === 0 ? (
              <div className="admin-empty-state">
                <div className="admin-empty-icon">📄</div>
                <p>No recipes found</p>
                <p className="admin-empty-subtext">Try adjusting your search or filters</p>
              </div>
            ) : (
              <div className="admin-recipes-grid">
                {pageItems.map((recipe) => (
                  <div key={recipe.id} className="admin-recipe-card">
                    <div className="admin-recipe-card-header">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(recipe.id)}
                        onChange={() => toggleSelected(recipe.id)}
                        style={{ marginRight: '0.5rem' }}
                      />
                      {recipe.image_url ? (
                        <div className="admin-recipe-card-image">
                          <img 
                            src={recipe.image_url} 
                            alt={recipe.name}
                            onError={(e) => {
                              e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmNWYyIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCxzYW5zLXNlcmlmIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOWNhOGExIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+UmVjaXBlIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
                            }}
                          />
                        </div>
                      ) : (
                        <div className="admin-recipe-card-image-placeholder">
                          <span>🍳</span>
                        </div>
                      )}
                      
                      <div className="admin-recipe-card-info">
                        <h3 className="admin-recipe-card-title">{recipe.name}</h3>
                        <div className="admin-recipe-card-meta">
                          <span className="admin-recipe-badge">{recipe.meal_type}</span>
                          <span className={`admin-badge ${(recipe.status || 'published') === 'published' ? 'success' : 'warning'}`}>
                            {recipe.status || 'published'}
                          </span>
                          {(recipe.status || 'published') !== 'published' && recipe.safety_flags?.length ? (
                            <span className={`admin-badge ${recipe.safety_flags.some((item) => item?.level === 'danger') ? 'danger' : 'warning'}`}>
                              Nutrition review
                            </span>
                          ) : null}
                          <span className="admin-recipe-time">
                            {(recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0)} min
                          </span>
                          <span className="admin-recipe-time">Created {formatDateTime(recipe.created_at)}</span>
                        </div>
                      </div>
                    </div>
                    
                    {recipe.description && (
                      <div className="admin-recipe-card-description">
                        <p>{recipe.description.length > 100 
                          ? `${recipe.description.substring(0, 100)}...` 
                          : recipe.description}</p>
                      </div>
                    )}
                    
                    <div className="admin-recipe-card-actions">
                      <Link
                        className="admin-button admin-button-edit"
                        href={`/admin/recipes/${recipe.id}`}
                      >
                        <span>✏️</span> Edit
                      </Link>
                      {(recipe.status || 'published') === 'draft' && (
                        <button
                          type="button"
                          className="admin-button admin-button-publish"
                          onClick={() => handlePublish(recipe)}
                          disabled={publishingId === recipe.id}
                        >
                          <span>🚀</span> {publishingId === recipe.id ? 'Publishing...' : 'Publish'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="admin-button admin-button-delete"
                        onClick={() => requestDelete(recipe)}
                      >
                        <span>🗑️</span> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Desktop Table View (hidden on mobile) */}
          <div className="admin-desktop-view">
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>
                      {draftIdsInView.length > 0 && (
                        <input type="checkbox" checked={allDraftsInViewSelected} onChange={toggleSelectAllDrafts} title="Select all drafts in view" />
                      )}
                    </th>
                    <th>Name</th>
                    <th>Meal Type</th>
                    <th>Time</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="admin-table-empty">
                        <div className="admin-empty-state">
                          <div className="admin-empty-icon">📄</div>
                          <p>No recipes found</p>
                          <p className="admin-empty-subtext">Try adjusting your search or filters</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pageItems.map((recipe) => (
                      <tr key={recipe.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(recipe.id)}
                            onChange={() => toggleSelected(recipe.id)}
                          />
                        </td>
                        <td>
                          <div className="admin-recipe-cell">
                            {recipe.image_url && (
                              <img 
                                src={recipe.image_url} 
                                alt={recipe.name}
                                className="admin-recipe-thumb"
                                onError={(e) => {
                                  e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmNWYyIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCxzYW5zLXNlcmlmIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOWNhOGExIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+UmVjaXBlIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
                                }}
                              />
                            )}
                            <div className="admin-recipe-details">
                              <strong>{recipe.name}</strong>
                              {recipe.description && (
                                <p className="admin-recipe-desc">
                                  {recipe.description.length > 60 
                                    ? `${recipe.description.substring(0, 60)}...` 
                                    : recipe.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="admin-badge admin-badge-meal">{recipe.meal_type}</span>
                          <span className={`admin-badge ${(recipe.status || 'published') === 'published' ? 'success' : 'warning'}`}>
                            {recipe.status || 'published'}
                          </span>
                          {(recipe.status || 'published') !== 'published' && recipe.safety_flags?.length ? (
                            <span className={`admin-badge ${recipe.safety_flags.some((item) => item?.level === 'danger') ? 'danger' : 'warning'}`}>
                              Nutrition review
                            </span>
                          ) : null}
                        </td>
                        <td>
                          <div className="admin-recipe-time-cell">
                            {(recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0)} min
                          </div>
                        </td>
                        <td>
                          <div className="admin-recipe-time-cell">{formatDateTime(recipe.created_at)}</div>
                        </td>
                        <td>
                          <div className="admin-table-actions">
                            <Link
                              className="admin-button admin-button-small admin-button-edit"
                              href={`/admin/recipes/${recipe.id}`}
                            >
                              Edit
                            </Link>
                            {(recipe.status || 'published') === 'draft' && (
                              <button
                                type="button"
                                className="admin-button admin-button-small admin-button-publish"
                                onClick={() => handlePublish(recipe)}
                                disabled={publishingId === recipe.id}
                              >
                                {publishingId === recipe.id ? 'Publishing...' : 'Publish'}
                              </button>
                            )}
                            <button
                              type="button"
                              className="admin-button admin-button-small admin-button-delete"
                              onClick={() => requestDelete(recipe)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {filtered.length > 0 && (
            <div className="admin-pagination">
              <div className="admin-pagination-controls">
                <button 
                  type="button" 
                  className="admin-pagination-btn admin-pagination-prev"
                  onClick={() => setPage(Math.max(1, page - 1))} 
                  disabled={page === 1}
                >
                  Previous
                </button>
                
                <div className="admin-pagination-info">
                  <span className="admin-pagination-text">
                    Page <strong>{page}</strong> of <strong>{totalPages}</strong>
                  </span>
                  <span className="admin-pagination-count">
                    ({filtered.length} recipes)
                  </span>
                </div>
                
                <button
                  type="button"
                  className="admin-pagination-btn admin-pagination-next"
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {pendingAction && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal">
            <div className="admin-modal-content">
              <h3>{pendingAction.bulk ? `Delete ${pendingAction.ids.length} Recipes` : 'Delete Recipe'}</h3>
              <p>
                {pendingAction.bulk
                  ? `Are you sure you want to delete ${pendingAction.ids.length} selected recipe(s)? This action cannot be undone.`
                  : `Are you sure you want to delete "${pendingAction.recipe.name}"? This action cannot be undone.`}
              </p>
              <div className="admin-modal-actions">
                <button
                  className="admin-button admin-button-cancel"
                  type="button"
                  onClick={() => setPendingAction(null)}
                  disabled={actionBusy}
                >
                  Cancel
                </button>
                <button
                  className="admin-button admin-button-confirm-delete"
                  type="button"
                  onClick={confirmDelete}
                  disabled={actionBusy}
                >
                  {actionBusy ? 'Deleting...' : pendingAction.bulk ? `Delete ${pendingAction.ids.length} Recipe(s)` : 'Delete Recipe'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
