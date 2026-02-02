import React, { useState } from 'react';
import {
  Box,
  Button,
  Container,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Stack,
  Text,
  useToast,
  useColorModeValue,
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const UserLogin: React.FC = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await axios.post('http://localhost:5000/api/user/login', formData);
      
      // Store the token and user data
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('userId', response.data.userId);

      toast({
        title: 'Login Successful',
        description: 'Welcome back!',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      // Add a small delay to ensure the toast is visible
      setTimeout(() => {
        // Always navigate to user dashboard first
        navigate('/user/dashboard');
      }, 1000);
    } catch (error: any) {
      // Clear any existing tokens
      localStorage.removeItem('token');
      localStorage.removeItem('userId');
      
      toast({
        title: 'Login Failed',
        description: error.response?.data?.error || 'An error occurred',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box minH="100vh" bg={useColorModeValue('gray.50', 'gray.900')} py={12}>
      <Container maxW="container.md">
        <Box
          bg={useColorModeValue('white', 'gray.800')}
          p={8}
          rounded="lg"
          shadow="base"
        >
          <Stack spacing={6}>
            <Heading
              size="lg"
              textAlign="center"
              color={useColorModeValue('gray.700', 'white')}
            >
              Welcome Back
            </Heading>

            <form onSubmit={handleSubmit}>
              <Stack spacing={4}>
                <FormControl isRequired>
                  <FormLabel>Email</FormLabel>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    placeholder="Enter your email"
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>Password</FormLabel>
                  <Input
                    type="password"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    placeholder="Enter your password"
                  />
                </FormControl>

                <Button
                  type="submit"
                  colorScheme="blue"
                  size="lg"
                  fontSize="md"
                  isLoading={isLoading}
                >
                  Login
                </Button>
              </Stack>
            </form>

            <Text textAlign="center" color={useColorModeValue('gray.600', 'gray.400')}>
              Don't have an account?{' '}
              <Button
                variant="link"
                color="blue.400"
                onClick={() => navigate('/user/register')}
              >
                Create one here
              </Button>
            </Text>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
};

export default UserLogin; 