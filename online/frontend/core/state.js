export const state = {
	appMode: 'local',
	userProfile: null,
	authToken: null,
	activeTab: 'enc',
	mgrTab: 'enc',
	authMode: 'login',
	pendingAction: null,
	selectedOnlineEncId: null,
	selectedDriveItemId: null,
	driveItems: [],
	fileDropdownOpen: false,
	encFile: null,
	decFile: null,
	encryptedBlobs: {},
	serverFiles: [],
	decryptionHistory: [],
	isLoading: false,
};

export function currentUser() {
	return state.userProfile;
}

export function isLoggedIn() {
	return !!state.authToken && !!state.userProfile;
}
