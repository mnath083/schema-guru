/**
 * Searches GitHub users by query string.
 *
 * @param {string} query - Search term for GitHub users.
 * @returns {Promise<Array>} A promise that resolves to an array of user items.
 * @throws {Error} Throws when the GitHub API response is not successful.
 */
export async function searchGithubUsers(query) {
  const url = "https://api.github.com/search/users?q=" + encodeURIComponent(query);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `GitHub user search failed (${response.status} ${response.statusText}).`
    );
  }

  const data = await response.json();
  return Array.isArray(data?.items) ? data.items : [];
}
