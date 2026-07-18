// ═══════════════ SUPABASE CONFIG ═══════════════
// anon key is safe for frontend - protected by Row Level Security
const SUPABASE_URL = 'https://jsphsntxmguzeagstcmk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzcGhzbnR4bWd1emVhZ3N0Y21rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMzUyNzgsImV4cCI6MjA5ODgxMTI3OH0.Ahv7JIhMITfLOyEHSRk4PUvUL1OT8T5HogguCwwd754';

// Initialize Supabase client
let supabaseClient = null;

function initSupabase() {
    if (supabaseClient) return supabaseClient;

    if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase initialized!');
    } else {
        console.error('❌ Supabase SDK not loaded! Add the CDN script first.');
    }

    return supabaseClient;
}

// ═══════════════ AUTH FUNCTIONS ═══════════════

// Sign up with email
async function signUpWithEmail(email, password) {
    const client = initSupabase();
    if (!client) return { error: 'Supabase not initialized' };

    try {
        const { data, error } = await client.auth.signUp({
            email: email,
            password: password
        });

        if (error) {
            console.error('Sign up error:', error.message);
            return { error: error.message };
        }

        console.log('✅ Sign up successful!');
        return { data };
    } catch (err) {
        console.error('Sign up failed:', err);
        return { error: 'Something went wrong. Please try again.' };
    }
}

// Sign in with email
async function signInWithEmail(email, password) {
    const client = initSupabase();
    if (!client) return { error: 'Supabase not initialized' };

    try {
        const { data, error } = await client.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            console.error('Sign in error:', error.message);
            return { error: error.message };
        }

        console.log('✅ Sign in successful!');
        return { data };
    } catch (err) {
        console.error('Sign in failed:', err);
        return { error: 'Something went wrong. Please try again.' };
    }
}

// Sign in with Google
async function signInWithGoogle() {
    const client = initSupabase();
    if (!client) return { error: 'Supabase not initialized' };

    try {
        const { data, error } = await client.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + '/hub/'
            }
        });

        if (error) {
            console.error('Google sign in error:', error.message);
            return { error: error.message };
        }

        return { data };
    } catch (err) {
        return { error: 'Google sign in failed' };
    }
}

// Sign out
async function signOut() {
    const client = initSupabase();
    if (!client) return { error: 'Supabase not initialized' };

    try {
        const { error } = await client.auth.signOut();

        if (error) {
            console.error('Sign out error:', error.message);
            return { error: error.message };
        }

        console.log('✅ Signed out!');
        window.location.href = '/';
        return { success: true };
    } catch (err) {
        return { error: 'Sign out failed' };
    }
}

// Get current user
async function getCurrentUser() {
    const client = initSupabase();
    if (!client) return null;

    try {
        const { data: { user } } = await client.auth.getUser();
        return user;
    } catch (err) {
        return null;
    }
}

// Check if logged in
async function isLoggedIn() {
    const user = await getCurrentUser();
    return user !== null;
}

// Get user profile from profiles table
async function getUserProfile() {
    const client = initSupabase();
    const user = await getCurrentUser();
    if (!client || !user) return null;

    try {
        const { data, error } = await client
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error) {
            console.error('Get profile error:', error.message);
            return null;
        }

        return data;
    } catch (err) {
        return null;
    }
}

// Update user profile
async function updateProfile(updates) {
    const client = initSupabase();
    const user = await getCurrentUser();
    if (!client || !user) return { error: 'Not logged in' };

    try {
        const { data, error } = await client
            .from('profiles')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id)
            .select()
            .single();

        if (error) {
            console.error('Update profile error:', error.message);
            return { error: error.message };
        }

        return { data };
    } catch (err) {
        return { error: 'Update failed' };
    }
}

// ═══════════════ GAME STATS FUNCTIONS ═══════════════

// Save game session
async function saveGameSession(gameData) {
    const client = initSupabase();
    if (!client) return { error: 'Not initialized' };

    try {
        const { data, error } = await client
            .from('game_sessions')
            .insert(gameData)
            .select()
            .single();

        if (error) {
            console.error('Save session error:', error.message);
            return { error: error.message };
        }

        return { data };
    } catch (err) {
        return { error: 'Save failed' };
    }
}

// Save player stats
async function savePlayerStats(statsData) {
    const client = initSupabase();
    if (!client) return { error: 'Not initialized' };

    try {
        const { data, error } = await client
            .from('player_stats')
            .insert(statsData)
            .select()
            .single();

        if (error) {
            console.error('Save stats error:', error.message);
            return { error: error.message };
        }

        return { data };
    } catch (err) {
        return { error: 'Save failed' };
    }
}

// Get leaderboard
async function getLeaderboard(gameType, limit) {
    const client = initSupabase();
    if (!client) return [];

    limit = limit || 10;

    try {
        const { data, error } = await client
            .from('profiles')
            .select('username, display_name, avatar_url, total_wins, total_games, level, xp')
            .order('total_wins', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Leaderboard error:', error.message);
            return [];
        }

        return data;
    } catch (err) {
        return [];
    }
}

// Get user's game history
async function getGameHistory(userId, limit) {
    const client = initSupabase();
    if (!client) return [];

    limit = limit || 20;

    try {
        const { data, error } = await client
            .from('player_stats')
            .select('*, game_sessions(*)')
            .eq('user_id', userId)
            .order('played_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('History error:', error.message);
            return [];
        }

        return data;
    } catch (err) {
        return [];
    }
}

// ═══════════════ ACHIEVEMENT FUNCTIONS ═══════════════

// Unlock achievement
async function unlockAchievement(achievementKey) {
    const client = initSupabase();
    const user = await getCurrentUser();
    if (!client || !user) return { error: 'Not logged in' };

    try {
        const { data, error } = await client
            .from('achievements')
            .upsert({
                user_id: user.id,
                achievement: achievementKey,
                unlocked_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,achievement'
            })
            .select()
            .single();

        if (error) {
            console.error('Achievement error:', error.message);
            return { error: error.message };
        }

        console.log('🏆 Achievement unlocked:', achievementKey);
        return { data };
    } catch (err) {
        return { error: 'Failed to unlock' };
    }
}

// Get user achievements
async function getUserAchievements() {
    const client = initSupabase();
    const user = await getCurrentUser();
    if (!client || !user) return [];

    try {
        const { data, error } = await client
            .from('achievements')
            .select('*')
            .eq('user_id', user.id)
            .order('unlocked_at', { ascending: false });

        if (error) {
            console.error('Achievements error:', error.message);
            return [];
        }

        return data;
    } catch (err) {
        return [];
    }
}

// ═══════════════ FRIENDS FUNCTIONS ═══════════════

// Send friend request
async function sendFriendRequest(friendId) {
    const client = initSupabase();
    const user = await getCurrentUser();
    if (!client || !user) return { error: 'Not logged in' };

    try {
        const { data, error } = await client
            .from('friends')
            .insert({
                user_id: user.id,
                friend_id: friendId,
                status: 'pending'
            })
            .select()
            .single();

        if (error) {
            console.error('Friend request error:', error.message);
            return { error: error.message };
        }

        return { data };
    } catch (err) {
        return { error: 'Request failed' };
    }
}

// Accept friend request
async function acceptFriendRequest(requestId) {
    const client = initSupabase();
    if (!client) return { error: 'Not initialized' };

    try {
        const { data, error } = await client
            .from('friends')
            .update({ status: 'accepted' })
            .eq('id', requestId)
            .select()
            .single();

        if (error) {
            return { error: error.message };
        }

        return { data };
    } catch (err) {
        return { error: 'Accept failed' };
    }
}

// Get friends list
async function getFriends() {
    const client = initSupabase();
    const user = await getCurrentUser();
    if (!client || !user) return [];

    try {
        const { data, error } = await client
            .from('friends')
            .select('*, profiles!friends_friend_id_fkey(*)')
            .eq('user_id', user.id)
            .eq('status', 'accepted');

        if (error) {
            console.error('Friends error:', error.message);
            return [];
        }

        return data;
    } catch (err) {
        return [];
    }
}

// Listen for auth changes
function onAuthChange(callback) {
    const client = initSupabase();
    if (!client) return;

    client.auth.onAuthStateChange(function (event, session) {
        console.log('Auth event:', event);
        callback(event, session);
    });
}

// Sign in with Facebook
async function signInWithFacebook() {
    var client = initSupabase();
    if (!client) return { error: 'Supabase not initialized' };

    try {
        var result = await client.auth.signInWithOAuth({
            provider: 'facebook',
            options: {
                redirectTo: window.location.origin + '/hub/'
            }
        });

        if (result.error) {
            console.error('Facebook sign in error:', result.error.message);
            return { error: result.error.message };
        }

        return { data: result.data };
    } catch (err) {
        return { error: 'Facebook sign in failed' };
    }
}

// ═══════════════ QUICK PLAY JOIN REQUESTS ═══════════════

// Requester side: create a pending join request for a specific session
async function createJoinRequest(sessionId, requesterName) {
    const client = initSupabase();
    const user = await getCurrentUser();
    if (!client || !user) return { error: 'Not logged in' };

    try {
        const { data, error } = await client
            .from('join_requests')
            .insert({
                session_id: sessionId,
                requester_id: user.id,
                requester_name: requesterName,
                status: 'pending'
            })
            .select()
            .single();

        if (error) {
            console.error('Join request error:', error.message);
            return { error: error.message };
        }

        return { data };
    } catch (err) {
        return { error: 'Join request failed' };
    }
}

// Requester side: watch a single request row for accept/decline
function subscribeToJoinRequestStatus(requestId, onUpdate) {
    const client = initSupabase();
    if (!client) return null;

    return client
        .channel('join-request-' + requestId)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'join_requests',
            filter: 'id=eq.' + requestId
        }, function (payload) {
            onUpdate(payload.new);
        })
        .subscribe();
}

// Host side: watch for new incoming requests on their own session
function subscribeToIncomingJoinRequests(sessionId, onNewRequest) {
    const client = initSupabase();
    if (!client) return null;

    return client
        .channel('host-requests-' + sessionId)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'join_requests',
            filter: 'session_id=eq.' + sessionId
        }, function (payload) {
            onNewRequest(payload.new);
        })
        .subscribe();
}

// Host side: respond to a request, and bump current_players on accept
async function respondToJoinRequest(requestId, sessionId, accepted, newPlayerCount) {
    const client = initSupabase();
    if (!client) return { error: 'Not initialized' };

    try {
        const { error: updateError } = await client
            .from('join_requests')
            .update({ status: accepted ? 'accepted' : 'declined' })
            .eq('id', requestId);

        if (updateError) return { error: updateError.message };

        if (accepted) {
            const { error: countError } = await client
                .from('game_sessions')
                .update({ current_players: newPlayerCount })
                .eq('id', sessionId);

            if (countError) return { error: countError.message };
        }

        return { success: true };
    } catch (err) {
        return { error: 'Failed to respond to request' };
    }
}

async function createGameSession(session) {
    const client = initSupabase();
    const user = await getCurrentUser();
    if (!client || !user) return { error: 'Not logged in' };

    try {
        const { data, error } = await client
            .from('game_sessions')
            .insert({
                game_type: session.gameType,
                room_code: session.roomCode,
                privacy: session.privacy || 'public',
                mode: session.mode || 'time_limit',
                max_players: session.maxPlayers || 2,
                status: 'waiting',
                current_players: 1,
                host_id: user.id
            })
            .select()
            .single();

        if (error) {
            console.error('Create session error:', error.message);
            return { error: error.message };
        }
        return { data };
    } catch (err) {
        return { error: 'Failed to create session' };
    }
}

async function updateGameSessionStatus(sessionId, updates) {
    const client = initSupabase();
    if (!client || !sessionId) return { error: 'Missing client or session id' };

    try {
        const { data, error } = await client
            .from('game_sessions')
            .update(updates)
            .eq('id', sessionId)
            .select()
            .single();

        if (error) return { error: error.message };
        return { data };
    } catch (err) {
        return { error: 'Update failed' };
    }
}

async function deleteGameSession(sessionId) {
    const client = initSupabase();
    if (!client || !sessionId) return { error: 'Missing client or session id' };

    try {
        const { error } = await client
            .from('game_sessions')
            .delete()
            .eq('id', sessionId);

        if (error) return { error: error.message };
        return { success: true };
    } catch (err) {
        return { error: 'Delete failed' };
    }
}

// Cleanup helper for either side
function unsubscribeChannel(channel) {
    const client = initSupabase();
    if (client && channel) client.removeChannel(channel);
}

console.log('🔐 Supabase module loaded!');