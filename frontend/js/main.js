import { initModal } from './ui/modal.js';
import { renderRecentSearches } from './ui/recentSearches.js';
import { initTabs } from './ui/tabs.js';
import { initFilters } from './ui/filters.js';
import { initRoundTripInput } from './ui/roundTrip.js';
import { initSearchForm } from './ui/searchForm.js';
import { initReset } from './ui/reset.js';

initModal();
initTabs();
initFilters();
initRoundTripInput();
initSearchForm();
initReset();
renderRecentSearches();