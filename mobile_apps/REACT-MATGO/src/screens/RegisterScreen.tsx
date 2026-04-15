import React, { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../store/useAppStore";
import { api } from "../lib/api";
import { palette, styles } from "../constants/theme";
import { Header, ScreenWrap, PrimaryButton } from "../components/ui";



export default function RegisterScreen({
  goBack,
  onRegistered,
}: {
  goBack: () => void;
  onRegistered: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const setToken = useAppStore((s) => s.setToken);

  const register = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.post("/api/account/register-user", {
        name,
        phone,
        email,
        password,
      });
      if (response.data?.token) {
        setToken(response.data.token);
      }
      onRegistered();
    } catch (error: any) {
      Alert.alert("Registration failed", error?.response?.data?.error || "Please try again.");
    } finally {
      setLoading(false);
    }
  }, [email, name, onRegistered, password, phone, setToken]);

  return (
    <ScreenWrap>
      <Header title="Register" subtitle="Password registration from the same API" onBack={goBack} />
      <View style={styles.formCard}>
        <TextInput style={styles.input} placeholder="Full name" placeholderTextColor={palette.muted} value={name} onChangeText={setName} />
        <TextInput style={styles.input} placeholder="Phone" placeholderTextColor={palette.muted} value={phone} onChangeText={setPhone} />
        <TextInput style={styles.input} placeholder="Email" placeholderTextColor={palette.muted} value={email} onChangeText={setEmail} />
        <TextInput style={styles.input} placeholder="Password" placeholderTextColor={palette.muted} secureTextEntry value={password} onChangeText={setPassword} />
        <PrimaryButton label={loading ? "Creating..." : "Create account"} onPress={register} disabled={loading} icon="person-add-outline" />
      </View>
    </ScreenWrap>
  );
}
