import { convexQuery, useConvexMutation } from '@convex-dev/react-query';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

interface FormData {
  name: string;
  handle: string;
}

export function useSettingsForm() {
  const router = useRouter();

  // Get current user data from Convex
  const {
    data: currentUser,
    isLoading: userLoading,
    refetch: refetchUser,
  } = useQuery(convexQuery(api.users.current, {}));

  const isInitialSetup = currentUser?.hasCompletedSetup === false;

  // Form state
  const [formData, setFormData] = useState<FormData>({
    name: '',
    handle: '',
  });
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Initialize form data when user data loads
  useEffect(() => {
    if (!userLoading) {
      if (currentUser) {
        // Existing user - populate form with their data
        setFormData({
          name: currentUser.name || '',
          handle: currentUser.handle || '',
        });
      } else {
        // New user - start with empty form
        setFormData({
          name: '',
          handle: '',
        });
      }
    }
  }, [currentUser, userLoading]);

  // Mutations
  const generateUploadUrlMutation = useMutation({
    mutationFn: useConvexMutation(api.users.generateUploadUrl),
  });

  const updateProfileMutation = useMutation({
    mutationFn: useConvexMutation(api.users.updateProfile),
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const uploadImage = async (): Promise<Id<'_storage'> | undefined> => {
    if (!selectedImage) {
      return currentUser?.imageStorageId;
    }

    const uploadUrl = await generateUploadUrlMutation.mutateAsync({});
    const result = await fetch(uploadUrl as string, {
      method: 'POST',
      headers: { 'Content-Type': selectedImage.type },
      body: selectedImage,
    });

    if (!result.ok) {
      throw new Error('이미지 업로드에 실패했습니다.');
    }

    const { storageId } = await result.json();
    return storageId;
  };

  const updateProfile = async (imageStorageId?: Id<'_storage'>) => {
    await updateProfileMutation.mutateAsync({
      name: formData.name,
      handle: formData.handle,
      ...(imageStorageId && { imageStorageId }),
    });
  };

  const handlePostUpdate = () => {
    setSelectedImage(null);
    setPreviewUrl('');
    setSuccessMessage('프로필이 성공적으로 업데이트되었습니다!');

    // For new users (currentUser is null) or users who haven't completed setup, redirect to home
    // For existing users who have completed setup, redirect to profile
    const isNewUser = !currentUser;

    setTimeout(() => {
      router.navigate({
        to: isNewUser || isInitialSetup ? '/' : '/profile',
      });
    }, 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const hasEmptyName = !formData.name.trim();
    const hasEmptyHandle = !formData.handle.trim();

    if (hasEmptyName || hasEmptyHandle) {
      setErrorMessage('이름과 핸들을 모두 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const imageStorageId = await uploadImage();
      await updateProfile(imageStorageId);
      await refetchUser();
      handlePostUpdate();
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : '프로필 업데이트 중 오류가 발생했습니다.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    currentUser,
    userLoading,
    formData,
    selectedImage,
    previewUrl,
    isSubmitting,
    successMessage,
    errorMessage,
    isInitialSetup,

    // Handlers
    handleInputChange,
    handleImageChange,
    handleSubmit,
  };
}
