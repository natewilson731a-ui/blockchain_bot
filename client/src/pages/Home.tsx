import React from 'react';
import {
  Box,
  Button,
  Container,
  Heading,
  Text,
  VStack,
  SimpleGrid,
  useColorModeValue,
  Icon as ChakraIcon,
  Flex,
  useColorMode,
  Switch,
  Image,
  HStack,
  IconProps as ChakraIconProps
} from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import { MoonIcon, SunIcon } from '@chakra-ui/icons';
import { FaUserShield, FaUsers } from 'react-icons/fa';
import type { IconType } from 'react-icons';
import chainLogo from '../assets/chain.PNG';

interface CustomIconProps extends Omit<ChakraIconProps, 'as'> {
  icon: IconType;
}

const CustomIcon: React.FC<CustomIconProps> = ({ icon: IconComponent, ...props }) => (
  <ChakraIcon as={IconComponent as any} {...props} />
);

const Home: React.FC = () => {
  const { colorMode, toggleColorMode } = useColorMode();
  const bgColor = useColorModeValue('gray.50', 'gray.900');
  const cardBgColor = useColorModeValue('white', 'gray.800');
  const textColor = useColorModeValue('gray.600', 'gray.300');

  return (
    <Box minH="100vh" bg={bgColor}>
      <Container maxW="container.xl" py={10}>
        {/* Header with Theme Toggle */}
        <Flex justify="flex-end" mb={4}>
          <HStack>
            <SunIcon color={colorMode === 'light' ? 'orange.500' : 'gray.500'} />
            <Switch
              isChecked={colorMode === 'dark'}
              onChange={toggleColorMode}
              colorScheme="cyan"
            />
            <MoonIcon color={colorMode === 'dark' ? 'blue.200' : 'gray.500'} />
          </HStack>
        </Flex>

        {/* Logo and Hero Section */}
        <VStack spacing={8} mb={16} textAlign="center">
          <Image
            src={chainLogo}
            alt="Block Vote Logo"
            width="180px"
            height="auto"
            mb={2}
          />
          <VStack spacing={4}>
            <Text
              fontSize="sm"
              fontFamily="'Courier New', monospace"
              color="cyan.400"
              letterSpacing="wider"
            >
              DECENTRALIZED VOTING SYSTEM
            </Text>
            <Heading
              as="h1"
              size="2xl"
              bgGradient="linear(to-r, cyan.400, blue.500)"
              bgClip="text"
              fontWeight="extrabold"
              letterSpacing="tight"
            >
              Block Vote
            </Heading>
            <Text
              fontSize="sm"
              fontFamily="'Courier New', monospace"
              color="cyan.400"
              letterSpacing="wider"
            >
              YOUR VOTE IS YOUR VOICE IN BLOCKCHAIN
            </Text>
          </VStack>
          <Text fontSize="xl" color={textColor} maxW="2xl">
            Welcome to Block Vote, where blockchain technology meets democracy. Experience
            a new era of voting that ensures security, transparency, and trust.
          </Text>
        </VStack>

        {/* Login Options */}
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={10} maxW="4xl" mx="auto">
          <Box
            p={8}
            bg={cardBgColor}
            borderRadius="xl"
            boxShadow="xl"
            textAlign="center"
            transition="all 0.3s"
            _hover={{ transform: 'translateY(-5px)' }}
          >
            <VStack spacing={4}>
              <CustomIcon
                icon={FaUserShield}
                boxSize={12}
                color="cyan.400"
              />
              <Heading as="h3" size="lg">
                Admin
              </Heading>
              <Text color={textColor}>
                Manage the voting system, verify voters, and oversee the election process.
              </Text>
              <Button
                as={Link}
                to="/admin/login"
                colorScheme="cyan"
                size="lg"
                width="full"
              >
                Admin Login
              </Button>
            </VStack>
          </Box>

          <Box
            p={8}
            bg={cardBgColor}
            borderRadius="xl"
            boxShadow="xl"
            textAlign="center"
            transition="all 0.3s"
            _hover={{ transform: 'translateY(-5px)' }}
          >
            <VStack spacing={4}>
              <CustomIcon
                icon={FaUsers}
                boxSize={12}
                color="cyan.400"
              />
              <Heading as="h3" size="lg">
                User
              </Heading>
              <Text color={textColor}>
                Register as a user and apply for voter verification to participate in elections.
              </Text>
              <Button
                as={Link}
                to="/user/login"
                colorScheme="cyan"
                size="lg"
                width="full"
              >
                User Login
              </Button>
              <Button
                as={Link}
                to="/user/register"
                variant="outline"
                colorScheme="cyan"
                size="lg"
                width="full"
              >
                Register
              </Button>
            </VStack>
          </Box>
        </SimpleGrid>

        <Text
          textAlign="center"
          mt={16}
          color={textColor}
          fontSize="sm"
        >
          © {new Date().getFullYear()} Block Vote. All rights reserved.
        </Text>
      </Container>
    </Box>
  );
};

export default Home; 